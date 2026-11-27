using UnityEngine;

namespace MeowballUnity
{
    /// <summary>
    /// Authentic Hamsterball PhysX Sphere Controller with Cruise/Burst Speed Caps & Mobile Gyroscope.
    /// Attach to a Sphere GameObject with Rigidbody + SphereCollider, and assign the Blender-rigged
    /// cat child Transform (kept upright inside the rolling bubble) to innerKitty.
    /// </summary>
    [RequireComponent(typeof(Rigidbody), typeof(SphereCollider))]
    public class MeowballController : MonoBehaviour
    {
        [Header("Speed & Feel")]
        public float driveAcceleration = 22f;
        public float flatCruiseMaxSpeed = 10.5f;
        public float slopeBurstMaxSpeed = 16.0f;
        public float burstDecayRate = 2.6f;

        [Header("Inner Blender-Rigged Cat")]
        public Transform innerKitty;
        public Animator kittyAnimator;

        [Header("Mobile Gyroscope")]
        public bool enableGyro = false;
        public float gyroSensitivity = 1.4f;

        private Rigidbody _rb;
        private Vector3 _gyroZero;
        private bool _gyroCalibrated;

        private void Awake()
        {
            _rb = GetComponent<Rigidbody>();
            _rb.maxAngularVelocity = 35f;
            if (SystemInfo.supportsGyroscope) Input.gyro.enabled = true;
        }

        private void FixedUpdate()
        {
            float ix = Input.GetAxis("Horizontal");
            float iz = Input.GetAxis("Vertical");

            if (enableGyro && SystemInfo.supportsGyroscope)
            {
                Vector3 g = Input.gyro.gravity;
                if (!_gyroCalibrated) { _gyroZero = g; _gyroCalibrated = true; }
                ix += Mathf.Clamp((g.x - _gyroZero.x) * gyroSensitivity * 2.5f, -1f, 1f);
                iz += Mathf.Clamp((g.y - _gyroZero.y) * gyroSensitivity * 2.5f, -1f, 1f);
            }

            Vector3 camForward = Camera.main ? Vector3.ProjectOnPlane(Camera.main.transform.forward, Vector3.up).normalized : Vector3.forward;
            Vector3 camRight = Camera.main ? Vector3.ProjectOnPlane(Camera.main.transform.right, Vector3.up).normalized : Vector3.right;
            Vector3 driveDir = camRight * ix + camForward * iz;
            if (driveDir.sqrMagnitude > 1f) driveDir.Normalize();

            _rb.AddForce(driveDir * driveAcceleration, ForceMode.Acceleration);

            // Separate flat cruise cap vs downhill burst cap
            Vector3 horizVel = new Vector3(_rb.linearVelocity.x, 0f, _rb.linearVelocity.z);
            float spd = horizVel.magnitude;
            bool onSlope = Physics.Raycast(transform.position, Vector3.down, out RaycastHit hit, 1.1f) && Vector3.Angle(hit.normal, Vector3.up) > 5f;
            float targetCap = onSlope ? slopeBurstMaxSpeed : flatCruiseMaxSpeed;

            if (spd > targetCap)
            {
                float clamped = onSlope ? targetCap : Mathf.MoveTowards(spd, targetCap, burstDecayRate * Time.fixedDeltaTime * 6f);
                Vector3 capped = horizVel.normalized * clamped;
                _rb.linearVelocity = new Vector3(capped.x, _rb.linearVelocity.y, capped.z);
            }

            if (innerKitty != null)
            {
                innerKitty.position = transform.position;
                if (spd > 0.2f)
                {
                    Quaternion targetRot = Quaternion.LookRotation(horizVel.normalized, Vector3.up);
                    innerKitty.rotation = Quaternion.Slerp(innerKitty.rotation, targetRot, Time.fixedDeltaTime * 10f);
                }
            }
            if (kittyAnimator != null)
            {
                kittyAnimator.speed = Mathf.Clamp(0.35f + spd * 0.14f, 0.25f, 2.2f);
            }
        }
    }
}
