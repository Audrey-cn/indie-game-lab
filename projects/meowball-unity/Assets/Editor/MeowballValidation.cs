using System;
using System.Linq;
using MeowballUnity;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

/// <summary>Optional editor/batch checks for the generated scene and its real physics interactions.</summary>
[InitializeOnLoad]
public static class MeowballValidation
{
    private const string ScenePath = "Assets/Scenes/FairyValleyStage1.unity";
    private const string RunningKey = "Meowball.Smoke.Running";
    private const string ExitKey = "Meowball.Smoke.Exit";
    private static int _phase;
    private static float _phaseStart;
    private static double _wallStart;
    private static Vector3 _sampleBallPosition;
    private static float _samplePlatformHeight;
    private static float _sampleTimer;
    private static int _sampleStars;
    private static float _maxBounceVelocity;
    private static Rigidbody _ball;
    private static MeowballController _controller;
    private static MeowballHud _hud;
    private static ElevatorPlatform _elevator;

    static MeowballValidation()
    {
        if (SessionState.GetBool(RunningKey, false))
            AttachSmokeCallbacks();
    }

    /// <summary>Use with -batchmode -nographics -quit -executeMethod MeowballValidation.ValidateGeneratedScene.</summary>
    public static void ValidateGeneratedScene()
    {
        Require(!EditorApplication.isPlayingOrWillChangePlaymode, "Validation must start outside Play Mode.");
        Require(AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) != null,
            "Generated scene is missing. Run MeowballSceneBuilder.BuildVerticalSlice first.");
        Scene scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
        GameObject[] roots = scene.GetRootGameObjects();
        foreach (GameObject root in roots)
        {
            foreach (Transform child in root.GetComponentsInChildren<Transform>(true))
                Require(GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(child.gameObject) == 0,
                    "Missing script on " + child.name);
        }

        Terrain terrain = UnityEngine.Object.FindFirstObjectByType<Terrain>();
        Require(terrain != null && terrain.name == "FairyValleyTerrain", "FairyValleyTerrain is missing.");
        Require(terrain.terrainData != null && terrain.GetComponent<TerrainCollider>() != null,
            "Terrain must have persistent TerrainData and collision.");
        Vector3 size = terrain.terrainData.size;
        Require(Mathf.Approximately(size.x, 160f) && Mathf.Approximately(size.z, 160f),
            "Terrain must be 160 x 160 metres.");
        float[,] heights = terrain.terrainData.GetHeights(0, 0, terrain.terrainData.heightmapResolution,
            terrain.terrainData.heightmapResolution);
        float minimum = float.MaxValue;
        float maximum = float.MinValue;
        foreach (float height in heights)
        {
            minimum = Mathf.Min(minimum, height);
            maximum = Mathf.Max(maximum, height);
        }
        Require((maximum - minimum) * size.y > 10f, "Valley needs sculpted hills rather than flat terrain.");
        float centre = terrain.SampleHeight(new Vector3(80f, 0f, 80f));
        float flank = Mathf.Max(terrain.SampleHeight(new Vector3(15f, 0f, 80f)),
            terrain.SampleHeight(new Vector3(145f, 0f, 80f)));
        Require(flank > centre + 5f, "Central corridor must sit below the valley flanks.");
        Require(terrain.terrainData.terrainLayers.Length > 0, "Terrain must have a painted surface layer.");

        Require(GraphicsSettings.defaultRenderPipeline is UniversalRenderPipelineAsset,
            "A URP pipeline asset must be assigned.");
        Camera camera = Camera.main;
        Require(camera != null && camera.GetComponent<HamsterCamera>() != null, "Main Camera needs HamsterCamera.");
        Light sun = UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None)
            .FirstOrDefault(light => light.type == LightType.Directional);
        Require(sun != null && sun.shadows == LightShadows.Soft, "Sun needs soft directional shadows.");
        Require(RenderSettings.skybox != null, "A procedural skybox is required.");
        Volume volume = UnityEngine.Object.FindObjectsByType<Volume>(FindObjectsSortMode.None)
            .FirstOrDefault(item => item.isGlobal && item.sharedProfile != null);
        Require(volume != null && volume.sharedProfile.TryGet<Bloom>(out _) &&
            volume.sharedProfile.TryGet<Tonemapping>(out _), "Global Volume needs Bloom and Tonemapping.");

        MeowballController player = UnityEngine.Object.FindFirstObjectByType<MeowballController>();
        Require(player != null && player.GetComponent<Rigidbody>() != null &&
            player.GetComponent<SphereCollider>() != null, "Player needs controller, Rigidbody and SphereCollider.");
        Require(player.innerKitty != null, "Player innerKitty reference is missing.");
        HamsterCamera follow = camera.GetComponent<HamsterCamera>();
        Require(follow.target == player.transform && follow.targetBody == player.GetComponent<Rigidbody>(),
            "Camera must follow the generated player.");
        MeowballHud hud = UnityEngine.Object.FindFirstObjectByType<MeowballHud>();
        Require(hud != null && hud.player == player.GetComponent<Rigidbody>() && hud.respawnPoint != null,
            "HUD must reference the player and its respawn point.");
        StarCandy[] stars = UnityEngine.Object.FindObjectsByType<StarCandy>(FindObjectsSortMode.None);
        Require(stars.Length > 0 && hud.totalStars == stars.Length, "HUD total must match collectible stars.");
        Require(stars.All(star => star.hud == hud && star.GetComponentsInChildren<Collider>()
            .Any(collider => collider.isTrigger)), "Every candy needs a trigger and the HUD reference.");
        ElevatorPlatform elevator = UnityEngine.Object.FindFirstObjectByType<ElevatorPlatform>();
        Require(elevator != null && elevator.GetComponent<Rigidbody>() != null &&
            elevator.GetComponent<Rigidbody>().isKinematic, "Elevator needs a kinematic Rigidbody.");
        Require(elevator.travelHeight > 0f && elevator.cycleSeconds > 0f, "Elevator motion must be configured.");
        Require(UnityEngine.Object.FindFirstObjectByType<BounceMushroom>() != null, "Bouncy mushroom is missing.");
        FinishPortalTrigger finish = UnityEngine.Object.FindFirstObjectByType<FinishPortalTrigger>();
        Require(finish != null && finish.hud == hud && finish.GetComponent<Collider>() != null &&
            finish.GetComponent<Collider>().isTrigger, "Finish portal needs a trigger and HUD reference.");
        Require(UnityEngine.Object.FindObjectsByType<MeshCollider>(FindObjectsSortMode.None)
            .Any(mesh => mesh.sharedMesh != null), "Course needs generated collidable curved geometry.");
        Require(EditorBuildSettings.scenes.Any(entry => entry.enabled && entry.path == ScenePath),
            "Generated scene is missing from enabled build settings.");

        foreach (Renderer renderer in UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsSortMode.None))
        {
            foreach (Material material in renderer.sharedMaterials)
                Require(material != null && material.shader != null, "Missing material/shader on " + renderer.name);
        }
        Debug.Log("MEOWBALL SCENE VALIDATION PASSED: terrain, URP, serialized scripts, course, player, stars and build settings.");
    }

    /// <summary>Use -batchmode -nographics -executeMethod MeowballValidation.RunGameplaySmokeTest, without -quit.</summary>
    public static void RunGameplaySmokeTest()
    {
        ValidateGeneratedScene();
        _phase = 0;
        SessionState.SetInt(ExitKey, -1);
        SessionState.SetBool(RunningKey, true);
        AttachSmokeCallbacks();
        EditorApplication.EnterPlaymode();
    }

    private static void AttachSmokeCallbacks()
    {
        _wallStart = EditorApplication.timeSinceStartup;
        EditorApplication.update -= SmokeUpdate;
        EditorApplication.update += SmokeUpdate;
        Application.logMessageReceived -= CaptureRuntimeError;
        Application.logMessageReceived += CaptureRuntimeError;
    }

    private static void CaptureRuntimeError(string message, string stackTrace, LogType type)
    {
        if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert)
            FinishSmoke(1, "Runtime logged " + type + ": " + message);
    }

    private static void SmokeUpdate()
    {
        if (!SessionState.GetBool(RunningKey, false))
            return;
        int exitCode = SessionState.GetInt(ExitKey, -1);
        if (exitCode >= 0)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                if (EditorApplication.isPlaying)
                    EditorApplication.ExitPlaymode();
                return;
            }
            SessionState.SetBool(RunningKey, false);
            EditorApplication.update -= SmokeUpdate;
            Application.logMessageReceived -= CaptureRuntimeError;
            if (Application.isBatchMode)
                EditorApplication.Exit(exitCode);
            return;
        }

        if (EditorApplication.timeSinceStartup - _wallStart > 90d)
        {
            FinishSmoke(1, "Timed out while entering Play Mode or testing physics.");
            return;
        }
        if (!EditorApplication.isPlaying)
            return;
        try
        {
            TickGameplaySmoke();
        }
        catch (Exception exception)
        {
            FinishSmoke(1, exception.Message);
        }
    }

    private static void TickGameplaySmoke()
    {
        switch (_phase)
        {
            case 0:
                _controller = UnityEngine.Object.FindFirstObjectByType<MeowballController>();
                _hud = UnityEngine.Object.FindFirstObjectByType<MeowballHud>();
                _elevator = UnityEngine.Object.FindFirstObjectByType<ElevatorPlatform>();
                Require(_controller != null && _hud != null && _elevator != null, "Runtime components did not deserialize.");
                _ball = _controller.GetComponent<Rigidbody>();
                _phaseStart = Time.time;
                _phase = 1;
                break;
            case 1:
                if (Time.time - _phaseStart < 0.5f) return;
                _sampleBallPosition = _ball.position;
                _ball.AddForce(Vector3.forward * 2f, ForceMode.VelocityChange);
                NextPhase();
                break;
            case 2:
                if (Time.time - _phaseStart < 0.3f) return;
                Require(_ball.position.z > _sampleBallPosition.z + 0.15f, "Ball did not move with real physics.");
                Require(_ball.position.y > _sampleBallPosition.y - 1f, "Start terrace did not support the ball.");
                Require(Vector3.Dot(_controller.innerKitty.up, Vector3.up) > 0.98f, "Inner kitty must remain upright while rolling.");
                StarCandy candy = UnityEngine.Object.FindObjectsByType<StarCandy>(FindObjectsSortMode.None)
                    .OrderBy(star => Vector3.SqrMagnitude(star.transform.position - _sampleBallPosition)).First();
                _sampleTimer = _hud.timeRemaining;
                _sampleStars = _hud.StarsCollected;
                Teleport(candy.GetComponentInChildren<Collider>().bounds.center);
                NextPhase();
                break;
            case 3:
                if (Time.time - _phaseStart < 0.18f) return;
                Require(_hud.StarsCollected == _sampleStars + 1, "Touching a candy did not increment the HUD.");
                Require(_hud.timeRemaining > _sampleTimer + 1.5f, "Candy did not add two seconds to the timer.");
                Require(_controller.BurstRemaining > 0f, "Candy did not enable a speed burst.");
                Bounds deck = _elevator.GetComponent<Collider>().bounds;
                float radius = _ball.GetComponent<SphereCollider>().radius * _ball.transform.lossyScale.y;
                Teleport(new Vector3(deck.center.x, deck.max.y + radius + 0.03f, deck.center.z));
                NextPhase();
                break;
            case 4:
                if (Time.time - _phaseStart < 0.2f) return;
                _samplePlatformHeight = _elevator.transform.position.y;
                _sampleBallPosition = _ball.position;
                NextPhase();
                break;
            case 5:
                if (Time.time - _phaseStart < 0.7f) return;
                float platformDelta = _elevator.transform.position.y - _samplePlatformHeight;
                Require(Mathf.Abs(platformDelta) > 0.04f, "Elevator did not move during its physics cycle.");
                Require(Mathf.Abs((_ball.position.y - _sampleBallPosition.y) - platformDelta) < 0.5f,
                    "Ball did not ride the moving elevator.");
                BounceMushroom mushroom = UnityEngine.Object.FindFirstObjectByType<BounceMushroom>();
                Collider mushroomCollider = mushroom.GetComponentsInChildren<Collider>()
                    .First(collider => !collider.isTrigger);
                Bounds cap = mushroomCollider.bounds;
                float ballRadius = _ball.GetComponent<SphereCollider>().radius * _ball.transform.lossyScale.y;
                Teleport(new Vector3(cap.center.x, cap.max.y + ballRadius + 0.08f, cap.center.z));
                _ball.linearVelocity = Vector3.down;
                _maxBounceVelocity = 0f;
                NextPhase();
                break;
            case 6:
                _maxBounceVelocity = Mathf.Max(_maxBounceVelocity, _ball.linearVelocity.y);
                if (Time.time - _phaseStart < 0.5f) return;
                Require(_maxBounceVelocity > 5f && _ball.linearVelocity.z > 1f,
                    "Mushroom contact did not launch the ball upward and forward.");
                FinishPortalTrigger finish = UnityEngine.Object.FindFirstObjectByType<FinishPortalTrigger>();
                Teleport(finish.GetComponent<Collider>().bounds.center);
                NextPhase();
                break;
            case 7:
                if (Time.time - _phaseStart < 0.2f) return;
                Require(_hud.StageComplete, "Entering the portal did not clear the stage.");
                Require(UnityEngine.Object.FindObjectsByType<Canvas>(FindObjectsSortMode.None).Length > 0,
                    "Runtime HUD Canvas was not created.");
                FinishSmoke(0, "MEOWBALL GAMEPLAY SMOKE PASSED: movement/support, upright kitty, candy time/burst, elevator ride, mushroom launch and finish HUD.");
                break;
        }
    }

    private static void Teleport(Vector3 position)
    {
        _ball.position = position;
        _ball.rotation = Quaternion.identity;
        _ball.linearVelocity = Vector3.zero;
        _ball.angularVelocity = Vector3.zero;
        Physics.SyncTransforms();
    }

    private static void NextPhase()
    {
        _phase++;
        _phaseStart = Time.time;
    }

    private static void FinishSmoke(int code, string message)
    {
        if (SessionState.GetInt(ExitKey, -1) >= 0)
            return;
        SessionState.SetInt(ExitKey, code);
        if (code == 0)
            Debug.Log(message);
        else
            Debug.LogError("MEOWBALL GAMEPLAY SMOKE FAILED: " + message);
        if (EditorApplication.isPlaying)
            EditorApplication.ExitPlaymode();
    }

    private static void Require(bool condition, string message)
    {
        if (!condition)
            throw new InvalidOperationException(message);
    }
}
