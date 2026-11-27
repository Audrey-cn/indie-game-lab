using UnityEngine;

namespace MeowballUnity
{
    // Unity associates this MonoScript with the partial implementation in MeowballGameplay.cs.
    [RequireComponent(typeof(Rigidbody), typeof(Collider))]
    public sealed partial class ElevatorPlatform : MonoBehaviour { }
}
