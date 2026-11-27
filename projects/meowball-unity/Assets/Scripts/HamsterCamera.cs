using UnityEngine;

namespace MeowballUnity
{
    /// <summary>Stable valley-facing follow camera with velocity look-ahead and speed FOV.</summary>
    [RequireComponent(typeof(Camera))]
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
            if (targetBody == null && target != null) targetBody = target.GetComponent<Rigidbody>();
            SnapToTarget();
        }

        public void SnapToTarget()
        {
            if (target == null) return;
            _lookSmooth = target.position + Vector3.up * 0.3f;
            transform.position = target.position + baseOffset;
            transform.LookAt(_lookSmooth);
            if (_cam != null) _cam.fieldOfView = baseFov;
        }

        private void LateUpdate()
        {
            if (target == null) return;
            Vector3 velocity = targetBody != null ? targetBody.linearVelocity : Vector3.zero;
            float speed = new Vector3(velocity.x, 0f, velocity.z).magnitude;
            Vector3 desiredPosition = target.position + baseOffset + new Vector3(-velocity.x * 0.15f, Mathf.Clamp(velocity.y * 0.2f, -1f, 2.5f) + speed * 0.12f, -speed * 0.15f);
            transform.position = Vector3.Lerp(transform.position, desiredPosition, 1f - Mathf.Exp(-Mathf.Max(0.1f, followSmooth) * Time.deltaTime));
            Vector3 lookTarget = target.position + new Vector3(velocity.x * 0.22f, 0.3f, velocity.z * 0.22f);
            _lookSmooth = Vector3.Lerp(_lookSmooth, lookTarget, 1f - Mathf.Exp(-8f * Time.deltaTime));
            transform.LookAt(_lookSmooth);
            float targetFov = baseFov + Mathf.Clamp(speed * 0.65f, 0f, 10f);
            _cam.fieldOfView = Mathf.Lerp(_cam.fieldOfView, targetFov, 1f - Mathf.Exp(-5f * Time.deltaTime));
        }
    }
}
