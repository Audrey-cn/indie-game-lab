using UnityEngine;

namespace MeowballUnity
{
    /// <summary>
    /// Dynamic Hamsterball Follow Camera with Velocity Look-Ahead, Airborne Lift & Dynamic FOV.
    /// </summary>
    public class HamsterCamera : MonoBehaviour
    {
        public Transform target;
        public Rigidbody targetBody;
        public Vector3 baseOffset = new Vector3(0f, 8.5f, -10.5f);
        public float followSmooth = 6f;
        public float baseFov = 45f;

        private Camera _cam;
        private Vector3 _lookSmooth;

        private void Awake()
        {
            _cam = GetComponent<Camera>();
            if (target != null) _lookSmooth = target.position;
        }

        private void LateUpdate()
        {
            if (target == null) return;
            Vector3 vel = targetBody != null ? targetBody.linearVelocity : Vector3.zero;
            float spd = new Vector3(vel.x, 0f, vel.z).magnitude;

            Vector3 desiredPos = target.position + baseOffset + new Vector3(-vel.x * 0.15f, Mathf.Clamp(vel.y * 0.2f, -1f, 2.5f) + spd * 0.12f, -spd * 0.15f);
            transform.position = Vector3.Lerp(transform.position, desiredPos, Time.deltaTime * followSmooth);

            Vector3 lookTarget = target.position + new Vector3(vel.x * 0.22f, 0.3f, vel.z * 0.22f);
            _lookSmooth = Vector3.Lerp(_lookSmooth, lookTarget, Time.deltaTime * 8f);
            transform.LookAt(_lookSmooth);

            if (_cam != null)
            {
                float targetFov = baseFov + Mathf.Clamp(spd * 0.65f, 0f, 10f);
                _cam.fieldOfView = Mathf.Lerp(_cam.fieldOfView, targetFov, Time.deltaTime * 5f);
            }
        }
    }
}
