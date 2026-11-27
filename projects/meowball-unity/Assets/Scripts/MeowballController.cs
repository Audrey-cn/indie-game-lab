using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace MeowballUnity
{
    /// <summary>Camera-relative PhysX sphere driving, with temporary candy speed boosts.</summary>
    [RequireComponent(typeof(Rigidbody), typeof(SphereCollider))]
    public class MeowballController : MonoBehaviour
    {
        [Header("Speed & Feel")]
        public float driveAcceleration = 22f;
        public float flatCruiseMaxSpeed = 10.5f;
        public float slopeBurstMaxSpeed = 16f;
        public float burstDecayRate = 2.6f;

        [Header("Inner Blender-Rigged Cat")]
        public Transform innerKitty;
        public Animator kittyAnimator;

        [Header("Mobile Gyroscope")]
        public bool enableGyro;
        public float gyroSensitivity = 1.4f;

        public bool ControlsEnabled { get; set; } = true;
        public float BurstRemaining => Mathf.Max(0f, _burstUntil - Time.time);

        private Rigidbody _rb;
        private Camera _camera;
        private Vector3 _gyroZero;
        private bool _gyroCalibrated;
        private float _burstUntil;
        private float _burstMultiplier = 1f;
        private Quaternion _kittyFacing = Quaternion.identity;

        private void Awake()
        {
            _rb = GetComponent<Rigidbody>();
            _rb.maxAngularVelocity = 35f;
            _camera = Camera.main;
            if (innerKitty != null) _kittyFacing = Quaternion.Euler(0f, innerKitty.eulerAngles.y, 0f);
#if ENABLE_INPUT_SYSTEM
            if (enableGyro && GravitySensor.current != null) InputSystem.EnableDevice(GravitySensor.current);
#elif ENABLE_LEGACY_INPUT_MANAGER
            if (enableGyro && SystemInfo.supportsGyroscope) Input.gyro.enabled = true;
#endif
        }

        private void FixedUpdate()
        {
            if (!ControlsEnabled || _rb.isKinematic) return;
            Vector2 input = ReadMovement();
            if (enableGyro && TryReadGravity(out Vector3 gravity))
            {
                if (!_gyroCalibrated)
                {
                    _gyroZero = gravity;
                    _gyroCalibrated = true;
                }
                input.x += Mathf.Clamp((gravity.x - _gyroZero.x) * gyroSensitivity * 2.5f, -1f, 1f);
                input.y += Mathf.Clamp((gravity.y - _gyroZero.y) * gyroSensitivity * 2.5f, -1f, 1f);
            }
            if (_camera == null) _camera = Camera.main;
            Vector3 forward = _camera != null ? Vector3.ProjectOnPlane(_camera.transform.forward, Vector3.up).normalized : Vector3.forward;
            Vector3 right = Vector3.Cross(Vector3.up, forward);
            Vector3 drive = Vector3.ClampMagnitude(right * input.x + forward * input.y, 1f);
            _rb.AddForce(drive * driveAcceleration, ForceMode.Acceleration);

            Vector3 velocity = _rb.linearVelocity;
            Vector3 horizontal = new Vector3(velocity.x, 0f, velocity.z);
            float speed = horizontal.magnitude;
            float probeLength = GetComponent<SphereCollider>().radius * Mathf.Abs(transform.lossyScale.y) + 0.3f;
            bool onSlope = Physics.Raycast(transform.position, Vector3.down, out RaycastHit hit, probeLength, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore)
                && Vector3.Angle(hit.normal, Vector3.up) > 5f;
            float speedCap = onSlope ? slopeBurstMaxSpeed : flatCruiseMaxSpeed;
            if (Time.time < _burstUntil) speedCap = Mathf.Max(speedCap, flatCruiseMaxSpeed * _burstMultiplier);
            if (speed > speedCap)
            {
                float cappedSpeed = Mathf.MoveTowards(speed, speedCap, burstDecayRate * Time.fixedDeltaTime * 6f);
                Vector3 capped = horizontal.normalized * cappedSpeed;
                _rb.linearVelocity = new Vector3(capped.x, velocity.y, capped.z);
            }
            if (kittyAnimator != null) kittyAnimator.speed = Mathf.Clamp(0.35f + speed * 0.14f, 0.25f, 2.2f);
        }

        private void LateUpdate()
        {
            if (innerKitty == null) return;
            Vector3 velocity = _rb.linearVelocity;
            Vector3 horizontal = new Vector3(velocity.x, 0f, velocity.z);
            if (horizontal.sqrMagnitude > 0.04f)
            {
                Quaternion desired = Quaternion.LookRotation(horizontal.normalized, Vector3.up);
                _kittyFacing = Quaternion.Slerp(_kittyFacing, desired, 1f - Mathf.Exp(-10f * Time.deltaTime));
            }
            // Counter the rolling rigidbody even when nearly stationary; the cat never tumbles.
            innerKitty.SetPositionAndRotation(transform.position, _kittyFacing);
        }

        public void ApplySpeedBurst(float duration = 2f, float speedMultiplier = 1.4f)
        {
            if (!ControlsEnabled) return;
            _burstUntil = Mathf.Max(_burstUntil, Time.time + Mathf.Max(0f, duration));
            _burstMultiplier = Mathf.Max(1f, speedMultiplier);
            Vector3 velocity = _rb.linearVelocity;
            Vector3 horizontal = new Vector3(velocity.x, 0f, velocity.z);
            Vector3 direction = horizontal.sqrMagnitude > 0.01f ? horizontal.normalized : Vector3.forward;
            float speed = Mathf.Min(flatCruiseMaxSpeed * _burstMultiplier, horizontal.magnitude + 3f);
            _rb.linearVelocity = direction * speed + Vector3.up * velocity.y;
        }

        public void ResetForRespawn(Vector3 position)
        {
            _rb.isKinematic = false;
            _rb.position = position;
            _rb.rotation = Quaternion.identity;
            _rb.linearVelocity = Vector3.zero;
            _rb.angularVelocity = Vector3.zero;
            _rb.WakeUp();
            _burstUntil = 0f;
            _burstMultiplier = 1f;
            _gyroCalibrated = false;
            _kittyFacing = Quaternion.identity;
            if (innerKitty != null) innerKitty.SetPositionAndRotation(position, _kittyFacing);
        }

        private static Vector2 ReadMovement()
        {
#if ENABLE_INPUT_SYSTEM
            Vector2 movement = Vector2.zero;
            Keyboard keyboard = Keyboard.current;
            if (keyboard != null)
            {
                movement.x = (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed ? 1f : 0f) - (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed ? 1f : 0f);
                movement.y = (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed ? 1f : 0f) - (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed ? 1f : 0f);
            }
            if (Gamepad.current != null) movement += Gamepad.current.leftStick.ReadValue();
            return Vector2.ClampMagnitude(movement, 1f);
#elif ENABLE_LEGACY_INPUT_MANAGER
            float x = (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow) ? 1f : 0f)
                - (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow) ? 1f : 0f);
            float y = (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow) ? 1f : 0f)
                - (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow) ? 1f : 0f);
            return Vector2.ClampMagnitude(new Vector2(x, y), 1f);
#else
            return Vector2.zero;
#endif
        }

        private static bool TryReadGravity(out Vector3 gravity)
        {
#if ENABLE_INPUT_SYSTEM
            if (GravitySensor.current != null)
            {
                gravity = GravitySensor.current.gravity.ReadValue();
                return true;
            }
#elif ENABLE_LEGACY_INPUT_MANAGER
            if (SystemInfo.supportsGyroscope)
            {
                gravity = Input.gyro.gravity;
                return true;
            }
#endif
            gravity = Vector3.zero;
            return false;
        }
    }
}
