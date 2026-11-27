using UnityEngine;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace MeowballUnity
{
    // Filename-matching partial declarations in the adjacent files give every component its
    // own MonoScript asset. Keeping the implementation here still makes this slice easy to read.
    public sealed partial class ElevatorPlatform
    {
        [Min(0f)] public float travelHeight = 7f;
        [Min(1f)] public float cycleSeconds = 7f;
        [Range(0f, 1f)] public float phaseOffset;

        private Rigidbody _body;
        private Vector3 _bottomPosition;
        private float _elapsed;

        private void Awake()
        {
            _body = GetComponent<Rigidbody>();
            _body.isKinematic = true;
            _body.useGravity = false;
            _body.interpolation = RigidbodyInterpolation.Interpolate;
            _bottomPosition = _body.position;
        }

        private void FixedUpdate()
        {
            _elapsed += Time.fixedDeltaTime;
            float phase = (_elapsed / Mathf.Max(1f, cycleSeconds) + phaseOffset) * Mathf.PI * 2f;
            // Cosine starts at the bottom at zero speed, easing boarding at both ends.
            float height = (1f - Mathf.Cos(phase)) * 0.5f * travelHeight;
            _body.MovePosition(_bottomPosition + Vector3.up * height);
        }
    }

    public sealed partial class BounceMushroom
    {
        public Vector3 launchVelocity = new Vector3(0f, 14f, 10f);
        public Transform visual;
        [Min(0.1f)] public float cooldown = 0.8f;

        private float _lastBounceTime = -10f;
        private float _squash;
        private Vector3 _visualScale;

        private void Awake()
        {
            if (visual != null) _visualScale = visual.localScale;
        }

        private void OnCollisionEnter(Collision collision)
        {
            Launch(collision.rigidbody);
        }

        private void OnTriggerEnter(Collider other)
        {
            Launch(other.attachedRigidbody);
        }

        private void OnTriggerStay(Collider other)
        {
            // A ball may enter at the cap rim before climbing onto the launch surface.
            Launch(other.attachedRigidbody);
        }

        private void Launch(Rigidbody body)
        {
            if (body == null || Time.time - _lastBounceTime < cooldown) return;
            MeowballController controller = body.GetComponent<MeowballController>();
            if (controller == null || !controller.ControlsEnabled || body.position.y < transform.position.y) return;
            _lastBounceTime = Time.time;
            _squash = 1f;
            Vector3 launch = launchVelocity;
            launch.x += body.linearVelocity.x * 0.25f;
            body.linearVelocity = launch;
            body.WakeUp();
            controller.ApplySpeedBurst(2f, 1.4f);
        }

        private void Update()
        {
            if (visual == null || _squash <= 0f) return;
            _squash = Mathf.MoveTowards(_squash, 0f, Time.deltaTime * 3.5f);
            float stretch = Mathf.Sin(_squash * Mathf.PI * 2f) * _squash;
            // Only the cap art squashes; the physical collider keeps its original dimensions.
            visual.localScale = Vector3.Scale(_visualScale, new Vector3(1f - stretch * 0.15f, 1f + stretch * 0.28f, 1f - stretch * 0.15f));
        }
    }

    public sealed partial class StarCandy
    {
        public MeowballHud hud;
        public float bonusSeconds = 2f;
        public float burstSeconds = 2f;
        public float rotationSpeed = 90f;
        public float bobHeight = 0.16f;
        private Vector3 _origin;
        private Quaternion _initialRotation;
        private bool _collected;

        private void Awake()
        {
            _origin = transform.position;
            _initialRotation = transform.rotation;
        }

        private void Update()
        {
            transform.Rotate(Vector3.up, rotationSpeed * Time.deltaTime, Space.World);
            transform.position = _origin + Vector3.up * (Mathf.Sin(Time.time * 2.6f + _origin.z) * bobHeight);
        }

        private void OnTriggerEnter(Collider other)
        {
            if (_collected || other.attachedRigidbody == null) return;
            MeowballController controller = other.attachedRigidbody.GetComponent<MeowballController>();
            if (controller == null || !controller.ControlsEnabled) return;
            if (hud == null) hud = FindFirstObjectByType<MeowballHud>();
            if (hud == null || !hud.IsRunning) return;
            _collected = true;
            hud.AddStar(bonusSeconds);
            controller.ApplySpeedBurst(burstSeconds, 1.4f);
            gameObject.SetActive(false);
        }

        public void Restore()
        {
            _collected = false;
            transform.SetPositionAndRotation(_origin, _initialRotation);
            gameObject.SetActive(true);
        }
    }

    public sealed partial class FinishPortalTrigger
    {
        public MeowballHud hud;

        private void OnTriggerEnter(Collider other)
        {
            if (other.attachedRigidbody == null || other.attachedRigidbody.GetComponent<MeowballController>() == null) return;
            if (hud == null) hud = FindFirstObjectByType<MeowballHud>();
            if (hud != null) hud.CompleteStage();
        }
    }

    public sealed partial class MeowballHud
    {
        public Rigidbody player;
        public Transform respawnPoint;
        public int totalStars;
        public float timeRemaining = 90f;
        public float fallResetHeight = 2.8f;
        public float rescueTimePenalty = 3f;
        public bool IsRunning { get; private set; } = true;
        public int Stars { get; private set; }
        public int StarsCollected => Stars;
        public bool StageComplete { get; private set; }

        private float _initialTime;
        private Vector3 _initialSpawn;
        private Transform _initialRespawnPoint;
        private MeowballController _controller;
        private StarCandy[] _candies;
        private Text _timerText;
        private Text _starText;
        private Text _speedText;
        private Text _statusText;
        private Text _hintText;

        private void Awake()
        {
            if (player == null)
            {
                MeowballController ball = FindFirstObjectByType<MeowballController>();
                if (ball != null) player = ball.GetComponent<Rigidbody>();
            }
            _controller = player != null ? player.GetComponent<MeowballController>() : null;
            _initialTime = Mathf.Max(1f, timeRemaining);
            _initialRespawnPoint = respawnPoint;
            _initialSpawn = respawnPoint != null ? respawnPoint.position : player != null ? player.position : Vector3.zero;
            _candies = FindObjectsByType<StarCandy>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            if (totalStars <= 0) totalStars = _candies.Length;
            BuildCanvas();
            RefreshLabels();
        }

        private void Update()
        {
            if (RestartPressed())
            {
                RestartStage();
                return;
            }
            if (IsRunning)
            {
                timeRemaining = Mathf.Max(0f, timeRemaining - Time.deltaTime);
                if (timeRemaining <= 0f) EndStage(false);
                else if (player != null && player.position.y < fallResetHeight)
                {
                    timeRemaining = Mathf.Max(0f, timeRemaining - rescueTimePenalty);
                    Respawn();
                }
            }
            RefreshLabels();
        }

        public void AddStar(float bonusSeconds = 2f)
        {
            if (!IsRunning) return;
            Stars++;
            timeRemaining += Mathf.Max(0f, bonusSeconds);
            RefreshLabels();
        }

        public void CompleteStage()
        {
            if (IsRunning) EndStage(true);
        }

        private void EndStage(bool cleared)
        {
            IsRunning = false;
            StageComplete = cleared;
            if (_controller != null) _controller.ControlsEnabled = false;
            if (player != null)
            {
                player.linearVelocity = Vector3.zero;
                player.angularVelocity = Vector3.zero;
                player.isKinematic = true;
            }
            _statusText.text = cleared ? "STAGE CLEAR!\nFairy Valley restored" : "TIME'S UP\nYour next adventure awaits";
            _statusText.color = cleared ? new Color(1f, 0.86f, 0.35f) : new Color(1f, 0.67f, 0.60f);
            _statusText.gameObject.SetActive(true);
            _hintText.text = "Press R to play again";
            RefreshLabels();
        }

        public void RestartStage()
        {
            timeRemaining = _initialTime;
            Stars = 0;
            StageComplete = false;
            respawnPoint = _initialRespawnPoint;
            IsRunning = true;
            foreach (StarCandy candy in _candies) if (candy != null) candy.Restore();
            _statusText.gameObject.SetActive(false);
            _hintText.text = "WASD / Arrow keys to roll   |   R to restart   |   Stars: +2s + speed burst";
            if (_controller != null) _controller.ControlsEnabled = true;
            Respawn();
            RefreshLabels();
        }

        public void SetCheckpoint(Transform checkpoint)
        {
            if (checkpoint != null) respawnPoint = checkpoint;
        }

        private void Respawn()
        {
            Vector3 destination = respawnPoint != null ? respawnPoint.position : _initialSpawn;
            if (_controller != null) _controller.ResetForRespawn(destination);
            else if (player != null)
            {
                player.isKinematic = false;
                player.position = destination;
                player.linearVelocity = Vector3.zero;
                player.angularVelocity = Vector3.zero;
            }
            if (Camera.main != null)
            {
                HamsterCamera follow = Camera.main.GetComponent<HamsterCamera>();
                if (follow != null) follow.SnapToTarget();
            }
        }

        private static bool RestartPressed()
        {
#if ENABLE_INPUT_SYSTEM
            return Keyboard.current != null && Keyboard.current.rKey.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
            return Input.GetKeyDown(KeyCode.R);
#else
            return false;
#endif
        }

        private void RefreshLabels()
        {
            if (_timerText == null) return;
            _timerText.text = "TIME  " + timeRemaining.ToString("00.0") + "s";
            _timerText.color = timeRemaining < 15f ? new Color(1f, 0.63f, 0.52f) : Color.white;
            _starText.text = "STARS  " + Stars + " / " + totalStars;
            float speed = player != null ? player.linearVelocity.magnitude * 3.6f : 0f;
            _speedText.text = "SPEED  " + speed.ToString("0") + " km/h";
        }

        private void BuildCanvas()
        {
            Canvas canvas = GetComponent<Canvas>();
            if (canvas == null) canvas = gameObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 20;
            CanvasScaler scaler = GetComponent<CanvasScaler>();
            if (scaler == null) scaler = gameObject.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280f, 720f);
            scaler.matchWidthOrHeight = 0.5f;
            Font font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

            GameObject bar = new GameObject("HUD Backdrop", typeof(RectTransform), typeof(Image));
            bar.transform.SetParent(transform, false);
            RectTransform barRect = bar.GetComponent<RectTransform>();
            barRect.anchorMin = new Vector2(0f, 1f);
            barRect.anchorMax = new Vector2(1f, 1f);
            barRect.pivot = new Vector2(0.5f, 1f);
            barRect.sizeDelta = new Vector2(0f, 82f);
            bar.GetComponent<Image>().color = new Color(0.07f, 0.15f, 0.17f, 0.82f);
            bar.GetComponent<Image>().raycastTarget = false;
            _timerText = Label("Timer", font, 26, TextAnchor.MiddleLeft, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(25f, -25f), new Vector2(250f, 48f));
            _starText = Label("Star Counter", font, 26, TextAnchor.MiddleCenter, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -25f), new Vector2(300f, 48f));
            _starText.color = new Color(1f, 0.86f, 0.4f);
            _speedText = Label("Speed", font, 26, TextAnchor.MiddleRight, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-25f, -25f), new Vector2(280f, 48f));
            Text title = Label("Stage Title", font, 17, TextAnchor.MiddleCenter, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -65f), new Vector2(600f, 28f));
            title.text = "MEOWBALL  /  FAIRY VALLEY  /  STAGE 1";
            title.color = new Color(0.74f, 0.94f, 0.83f);
            _hintText = Label("Controls", font, 18, TextAnchor.MiddleCenter, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 30f), new Vector2(1200f, 50f));
            _hintText.text = "WASD / Arrow keys to roll   |   R to restart   |   Stars: +2s + speed burst";
            _statusText = Label("Stage Clear Banner", font, 48, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1100f, 220f));
            _statusText.gameObject.SetActive(false);
        }

        private Text Label(string labelName, Font font, int size, TextAnchor alignment, Vector2 anchor, Vector2 pivot, Vector2 position, Vector2 dimensions)
        {
            GameObject label = new GameObject(labelName, typeof(RectTransform), typeof(Text), typeof(Outline));
            label.transform.SetParent(transform, false);
            RectTransform rect = label.GetComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = anchor;
            rect.pivot = pivot;
            rect.anchoredPosition = position;
            rect.sizeDelta = dimensions;
            Text text = label.GetComponent<Text>();
            text.font = font;
            text.fontSize = size;
            text.alignment = alignment;
            text.color = Color.white;
            text.raycastTarget = false;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            Outline outline = label.GetComponent<Outline>();
            outline.effectColor = new Color(0.03f, 0.08f, 0.09f, 0.9f);
            outline.effectDistance = new Vector2(1.5f, -1.5f);
            return text;
        }
    }
}
