using System;
using System.Collections.Generic;
using System.IO;
using MeowballUnity;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

/// <summary>Deterministic, repeatable Unity 6 / URP Stage 1 authoring. No glTF runtime dependency.</summary>
public static class MeowballSceneBuilder
{
    public const string ScenePath = "Assets/Scenes/FairyValleyStage1.unity";
    private const string Generated = "Assets/MeowballGenerated";
    private const float Center = 80f;
    private static Transform _world;
    private static Material _cream, _teal, _gold, _wood, _leaf, _pink, _red, _stone, _glow;
    private static readonly Dictionary<string, GameObject> Models = new Dictionary<string, GameObject>();

    [MenuItem("Meowball/Build Fairy Valley Vertical Slice", priority = 0)]
    public static void BuildVerticalSlice()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
            throw new InvalidOperationException("Stop Play mode before building Fairy Valley.");
        // Interactive authoring preserves unsaved work; batchmode deliberately never opens dialogs.
        if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
        EnsureFolder("Assets/Scenes");
        EnsureFolder(Generated);
        EnsureFolder(Generated + "/Materials");
        EnsureFolder(Generated + "/Meshes");
        EnsureFolder(Generated + "/Terrain");
        Models.Clear();
        ConfigurePipeline();
        Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        _world = new GameObject("Fairy Valley • Stage 1").transform;
        CreateMaterials();
        CreateLighting();
        Terrain terrain = CreateTerrain();
        Transform course = Group("Stage 1 Course", _world);
        CreateCourse(course);
        DressValley(terrain);
        MeowballController player = CreatePlayer();
        CreateCamera(player);
        Transform spawn = Group("Start Respawn", _world);
        spawn.position = new Vector3(Center, 11.05f, 20f);
        MeowballHud hud = new GameObject("Meowball HUD", typeof(RectTransform), typeof(Canvas)).AddComponent<MeowballHud>();
        hud.transform.SetParent(_world);
        hud.player = player.GetComponent<Rigidbody>();
        hud.respawnPoint = spawn;
        hud.timeRemaining = 90f;
        hud.fallResetHeight = 3.35f;
        CreateCandies(hud);
        CreateFinish(hud, course);
        Physics.gravity = new Vector3(0f, -9.81f, 0f);
        PlayerSettings.colorSpace = ColorSpace.Linear;
        PlayerSettings.companyName = "Meowball";
        PlayerSettings.productName = "Meowball — Fairy Valley";
        EditorSceneManager.MarkSceneDirty(scene);
        if (!EditorSceneManager.SaveScene(scene, ScenePath))
            throw new IOException("Unity could not save " + ScenePath);
        var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
        int index = scenes.FindIndex(s => s.path == ScenePath);
        if (index < 0) scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
        else scenes[index] = new EditorBuildSettingsScene(ScenePath, true);
        EditorBuildSettings.scenes = scenes.ToArray();
        AssetDatabase.SaveAssets();
        Selection.activeGameObject = player.gameObject;
        if (SceneView.lastActiveSceneView != null)
            SceneView.lastActiveSceneView.LookAt(new Vector3(80f, 7f, 62f), Quaternion.Euler(35f, 0f, 0f), 65f);
        Debug.Log("[Meowball] Fairy Valley Stage 1 built: " + ScenePath +
                  ". Press Play. Move: WASD / arrows / gamepad. R: restart. Stars: +2 seconds and a speed burst.");
    }

    private static void ConfigurePipeline()
    {
        string rendererPath = Generated + "/FairyValleyRenderer.asset";
        var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(rendererPath);
        if (renderer == null)
        {
            renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
            renderer.name = "Fairy Valley Forward Renderer";
            AssetDatabase.CreateAsset(renderer, rendererPath);
        }
        renderer.postProcessData = AssetDatabase.LoadAssetAtPath<PostProcessData>(
            "Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
        EditorUtility.SetDirty(renderer);
        string pipelinePath = Generated + "/FairyValleyURP.asset";
        var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(pipelinePath);
        if (pipeline == null)
        {
            pipeline = UniversalRenderPipelineAsset.Create(renderer);
            pipeline.name = "Fairy Valley URP";
            AssetDatabase.CreateAsset(pipeline, pipelinePath);
        }
        pipeline.supportsHDR = true;
        pipeline.msaaSampleCount = 4;
        pipeline.mainLightShadowmapResolution = 2048;
        // URP 17 exposes these flags as read-only properties to user assemblies.
        var pipelineSettings = new SerializedObject(pipeline);
        SerializedProperty renderers = pipelineSettings.FindProperty("m_RendererDataList");
        renderers.arraySize = 1;
        renderers.GetArrayElementAtIndex(0).objectReferenceValue = renderer;
        pipelineSettings.FindProperty("m_DefaultRendererIndex").intValue = 0;
        pipelineSettings.FindProperty("m_MainLightShadowsSupported").boolValue = true;
        pipelineSettings.FindProperty("m_SoftShadowsSupported").boolValue = true;
        pipelineSettings.ApplyModifiedPropertiesWithoutUndo();
        pipeline.shadowDistance = 115f;
        pipeline.shadowCascadeCount = 4;
        EditorUtility.SetDirty(pipeline);
        GraphicsSettings.defaultRenderPipeline = pipeline;
        // Every quality level must use URP, including standalone builds with a different default tier.
        int originalQuality = QualitySettings.GetQualityLevel();
        for (int i = 0; i < QualitySettings.names.Length; i++)
        {
            QualitySettings.SetQualityLevel(i, false);
            QualitySettings.renderPipeline = pipeline;
        }
        QualitySettings.SetQualityLevel(originalQuality, false);
        QualitySettings.shadows = UnityEngine.ShadowQuality.All;
        QualitySettings.shadowResolution = UnityEngine.ShadowResolution.High;
    }

    private static void CreateMaterials()
    {
        _cream = Lit("Warm Porcelain", new Color(0.94f, 0.88f, 0.70f), 0.3f);
        _teal = Lit("Lagoon Course", new Color(0.23f, 0.66f, 0.62f), 0.34f);
        _gold = Lit("Honey Gold", new Color(1f, 0.66f, 0.13f), 0.65f, 0.5f);
        _wood = Lit("Cedar", new Color(0.31f, 0.18f, 0.10f), 0.1f);
        _leaf = Lit("Apple Foliage", new Color(0.26f, 0.52f, 0.17f), 0.14f);
        _pink = Lit("Blossom", new Color(0.98f, 0.48f, 0.66f), 0.22f);
        _red = Lit("Mushroom Ruby", new Color(0.87f, 0.075f, 0.12f), 0.43f);
        _stone = Lit("Lilac Stone", new Color(0.44f, 0.44f, 0.57f), 0.18f);
        _glow = Lit("Star Candy", new Color(1f, 0.75f, 0.12f), 0.65f, 0.45f);
        _glow.EnableKeyword("_EMISSION");
        _glow.SetColor("_EmissionColor", new Color(2.8f, 1.3f, 0.12f));
        EditorUtility.SetDirty(_glow);
    }

    private static Material Lit(string name, Color color, float smoothness = 0.25f, float metallic = 0f)
    {
        Shader shader = Shader.Find("Universal Render Pipeline/Lit");
        if (shader == null) throw new InvalidOperationException("Install Universal RP before building Fairy Valley.");
        string path = Generated + "/Materials/" + name + ".mat";
        Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (material == null)
        {
            material = new Material(shader) { name = name };
            AssetDatabase.CreateAsset(material, path);
        }
        material.shader = shader;
        material.SetColor("_BaseColor", color);
        material.SetFloat("_Smoothness", smoothness);
        material.SetFloat("_Metallic", metallic);
        EditorUtility.SetDirty(material);
        return material;
    }

    private static void CreateLighting()
    {
        var sunObject = new GameObject("Warm Afternoon Sun");
        sunObject.transform.SetParent(_world);
        sunObject.transform.rotation = Quaternion.Euler(42f, -32f, 0f);
        Light sun = sunObject.AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.color = new Color(1f, 0.86f, 0.64f);
        sun.intensity = 1.55f;
        sun.shadows = LightShadows.Soft;
        sun.shadowStrength = 0.72f;
        sun.shadowBias = 0.04f;
        sun.shadowNormalBias = 0.25f;
        sunObject.AddComponent<UniversalAdditionalLightData>();
        RenderSettings.sun = sun;
        Shader skyShader = Shader.Find("Skybox/Procedural");
        if (skyShader == null) throw new InvalidOperationException("Unity's procedural skybox shader is missing.");
        string skyPath = Generated + "/Materials/Fairy Sky.mat";
        Material sky = AssetDatabase.LoadAssetAtPath<Material>(skyPath);
        if (sky == null)
        {
            sky = new Material(skyShader) { name = "Fairy Sky" };
            AssetDatabase.CreateAsset(sky, skyPath);
        }
        sky.SetFloat("_SunDisk", 2f);
        sky.EnableKeyword("_SUNDISK_HIGH_QUALITY");
        sky.SetFloat("_SunSize", 0.035f);
        sky.SetFloat("_AtmosphereThickness", 0.9f);
        sky.SetFloat("_Exposure", 1.15f);
        sky.SetColor("_SkyTint", new Color(0.48f, 0.67f, 0.83f));
        sky.SetColor("_GroundColor", new Color(0.55f, 0.61f, 0.39f));
        RenderSettings.skybox = sky;
        EditorUtility.SetDirty(sky);
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(0.63f, 0.77f, 0.88f);
        RenderSettings.ambientEquatorColor = new Color(0.54f, 0.64f, 0.46f);
        RenderSettings.ambientGroundColor = new Color(0.28f, 0.32f, 0.22f);
        RenderSettings.ambientIntensity = 1f;
        RenderSettings.fog = true;
        RenderSettings.fogColor = new Color(0.69f, 0.81f, 0.70f);
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogDensity = 0.0048f;
        string profilePath = Generated + "/FairyValleyVolume.asset";
        VolumeProfile profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(profilePath);
        if (profile == null)
        {
            profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, profilePath);
        }
        if (!profile.TryGet(out Bloom bloom))
        {
            bloom = profile.Add<Bloom>(true);
            AssetDatabase.AddObjectToAsset(bloom, profile);
        }
        bloom.active = true;
        bloom.threshold.Override(1.1f);
        bloom.intensity.Override(0.25f);
        bloom.scatter.Override(0.65f);
        if (!profile.TryGet(out Tonemapping tonemapping))
        {
            tonemapping = profile.Add<Tonemapping>(true);
            AssetDatabase.AddObjectToAsset(tonemapping, profile);
        }
        tonemapping.active = true;
        tonemapping.mode.Override(TonemappingMode.Neutral);
        EditorUtility.SetDirty(bloom);
        EditorUtility.SetDirty(tonemapping);
        EditorUtility.SetDirty(profile);
        var volumeObject = new GameObject("Fairy Valley Global Volume");
        volumeObject.transform.SetParent(_world);
        Volume volume = volumeObject.AddComponent<Volume>();
        volume.isGlobal = true;
        volume.sharedProfile = profile;
        volume.priority = 1f;
    }

    private static Terrain CreateTerrain()
    {
        string path = Generated + "/Terrain/FairyValleyTerrain.asset";
        TerrainData data = AssetDatabase.LoadAssetAtPath<TerrainData>(path);
        if (data == null)
        {
            data = new TerrainData { name = "Fairy Valley Sculpt" };
            AssetDatabase.CreateAsset(data, path);
        }
        data.heightmapResolution = 257;
        data.alphamapResolution = 256;
        data.baseMapResolution = 512;
        data.size = new Vector3(160f, 34f, 160f);
        var heights = new float[257, 257];
        for (int z = 0; z < 257; z++)
        for (int x = 0; x < 257; x++)
        {
            float wx = x * 160f / 256f;
            float wz = z * 160f / 256f;
            float flank = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(12f, 55f, Mathf.Abs(wx - Center)));
            float rolling = 0.5f + 0.5f * Mathf.Sin(wz * 0.052f + wx * 0.018f);
            float noise = Mathf.PerlinNoise(wx * 0.025f + 19f, wz * 0.024f + 7f);
            float rear = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(143f, 160f, wz));
            // Broad low corridor, green foothills, then distant mountain shoulders on both sides.
            float height = 2.1f + 0.25f * noise + flank * (8f + 12f * noise + 4f * rolling) + 8f * rear;
            heights[z, x] = height / data.size.y;
        }
        data.SetHeights(0, 0, heights);
        TerrainLayer meadow = TerrainPaint("Meadow", new Color(0.32f, 0.55f, 0.15f), new Color(0.52f, 0.66f, 0.24f));
        TerrainLayer moss = TerrainPaint("Hill Moss", new Color(0.20f, 0.39f, 0.14f), new Color(0.38f, 0.53f, 0.20f));
        TerrainLayer rock = TerrainPaint("Mountain Rock", new Color(0.42f, 0.43f, 0.36f), new Color(0.57f, 0.55f, 0.42f));
        data.terrainLayers = new[] { meadow, moss, rock };
        var splat = new float[256, 256, 3];
        for (int z = 0; z < 256; z++)
        for (int x = 0; x < 256; x++)
        {
            float nx = x / 255f, nz = z / 255f;
            float slope = data.GetSteepness(nx, nz);
            float stoneWeight = Mathf.Clamp01((slope - 27f) / 28f) * 0.65f;
            float mossWeight = Mathf.SmoothStep(0f, 0.65f, Mathf.Abs(nx * 160f - Center) / 70f);
            splat[z, x, 0] = (1f - mossWeight) * (1f - stoneWeight);
            splat[z, x, 1] = mossWeight * (1f - stoneWeight);
            splat[z, x, 2] = stoneWeight;
        }
        data.SetAlphamaps(0, 0, splat);
        EditorUtility.SetDirty(data);
        GameObject terrainObject = Terrain.CreateTerrainGameObject(data);
        terrainObject.name = "FairyValleyTerrain";
        terrainObject.transform.SetParent(_world);
        Terrain terrain = terrainObject.GetComponent<Terrain>();
        terrain.heightmapPixelError = 5f;
        terrain.basemapDistance = 250f;
        terrain.drawInstanced = true;
        Shader terrainShader = Shader.Find("Universal Render Pipeline/Terrain/Lit");
        if (terrainShader == null) throw new InvalidOperationException("URP Terrain/Lit shader is unavailable.");
        string matPath = Generated + "/Materials/Valley Terrain.mat";
        Material material = AssetDatabase.LoadAssetAtPath<Material>(matPath);
        if (material == null)
        {
            material = new Material(terrainShader);
            AssetDatabase.CreateAsset(material, matPath);
        }
        terrain.materialTemplate = material;
        return terrain;
    }

    private static TerrainLayer TerrainPaint(string name, Color dark, Color light)
    {
        // Persist textures and layers; the scene survives domain reloads and player builds.
        string texturePath = Generated + "/Terrain/" + name + ".asset";
        Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(texturePath);
        if (texture == null)
        {
            texture = new Texture2D(64, 64, TextureFormat.RGBA32, true) { name = name, wrapMode = TextureWrapMode.Repeat };
            AssetDatabase.CreateAsset(texture, texturePath);
        }
        var pixels = new Color[64 * 64];
        for (int z = 0; z < 64; z++)
        for (int x = 0; x < 64; x++)
            pixels[z * 64 + x] = Color.Lerp(dark, light, Mathf.PerlinNoise(x * 0.22f + 4f, z * 0.22f + 7f));
        texture.SetPixels(pixels);
        texture.Apply(true, false);
        EditorUtility.SetDirty(texture);
        string layerPath = Generated + "/Terrain/" + name + ".terrainlayer";
        TerrainLayer layer = AssetDatabase.LoadAssetAtPath<TerrainLayer>(layerPath);
        if (layer == null)
        {
            layer = new TerrainLayer { name = name };
            AssetDatabase.CreateAsset(layer, layerPath);
        }
        layer.diffuseTexture = texture;
        layer.tileSize = new Vector2(9f, 9f);
        layer.smoothness = 0.08f;
        EditorUtility.SetDirty(layer);
        return layer;
    }

    private static void CreateCourse(Transform parent)
    {
        Deck("01 Start Terrace", new Vector3(80f, 10f, 22f), new Vector2(14f, 14f), parent, true);
        CreateRamp(parent);
        CreateHalfPipe(parent);
        Block("Trough Exit Apron", new Vector3(80f, 3.45f, 86f), new Vector3(8f, 0.7f, 4f), _teal, parent);
        GameObject elevator = Block("04 Dynamic Vertical Elevator Platform", new Vector3(80f, 3.45f, 93f),
            new Vector3(10f, 0.7f, 12f), _teal, parent);
        Rigidbody liftBody = elevator.AddComponent<Rigidbody>();
        liftBody.isKinematic = true;
        liftBody.useGravity = false;
        liftBody.interpolation = RigidbodyInterpolation.Interpolate;
        ElevatorPlatform lift = elevator.AddComponent<ElevatorPlatform>();
        lift.travelHeight = 7f;
        lift.cycleSeconds = 9f;
        // Keep children in world-sized units rather than inheriting the cube's non-uniform scale.
        elevator.transform.localScale = Vector3.one;
        elevator.GetComponent<BoxCollider>().size = new Vector3(10f, 0.7f, 12f);
        Object.DestroyImmediate(elevator.GetComponent<MeshRenderer>());
        Object.DestroyImmediate(elevator.GetComponent<MeshFilter>());
        Block("Moving Lift Deck", elevator.transform.position, new Vector3(10f, 0.7f, 12f), _teal, elevator.transform, false);
        foreach (float side in new[] { -1f, 1f })
        {
            Block("Lift Guide", new Vector3(80f + side * 5.7f, 7f, 93f), new Vector3(0.28f, 12f, 0.28f), _gold, parent, false);
            Block("Lift Safety Rail", new Vector3(80f + side * 4.8f, 4.2f, 93f), new Vector3(0.18f, 1f, 11.8f), _cream, elevator.transform);
        }
        Deck("05 Upper Mushroom Approach", new Vector3(80f, 10.8f, 106f), new Vector2(10f, 14.4f), parent, false);
        CreateMushroom(parent);
        Deck("06 Finish Terrace", new Vector3(80f, 11f, 133.5f), new Vector2(19f, 22f), parent, true);
        // Side rails contain a beginner's first roll; entrance/exit gaps remain completely open.
        Rail(new Vector3(73.3f, 10.8f, 15.5f), new Vector3(73.3f, 10.8f, 28.7f), parent);
        Rail(new Vector3(86.7f, 10.8f, 15.5f), new Vector3(86.7f, 10.8f, 28.7f), parent);
        Rail(new Vector3(73.3f, 10.8f, 15.5f), new Vector3(86.7f, 10.8f, 15.5f), parent);
        for (int side = -1; side <= 1; side += 2)
        {
            Rail(new Vector3(80f + side * 4.8f, 11.6f, 99f), new Vector3(80f + side * 4.8f, 11.6f, 111.5f), parent);
            Rail(new Vector3(80f + side * 9f, 11.8f, 123f), new Vector3(80f + side * 9f, 11.8f, 144f), parent);
        }
        CourseLabel("FAIRY VALLEY", "STAGE 01   /   STARLIGHT RUN", new Vector3(80f, 14.5f, 16f), parent);
        CourseLabel("RIDE THE BLOOM LIFT", "Wait for the platform, then roll on", new Vector3(80f, 9.5f, 88f), parent);
        CourseLabel("MUSHROOM HOP", "Roll into the red cap", new Vector3(80f, 15f, 109f), parent);
        // Route markers are low flat inlays, never obstacles in the center lane.
        foreach (float z in new[] { 24f, 32f, 40f, 48f, 56f, 64f, 72f, 80f, 102f, 108f, 126f, 132f })
        {
            float y = CourseHeight(z) + 0.025f;
            for (int side = -1; side <= 1; side += 2)
                Beam("Forward Chevron", new Vector3(80f, y, z + 0.65f), new Vector3(80f + side * 0.7f, y, z), 0.1f, _gold, parent, false);
        }
    }

    private static void CreateRamp(Transform parent)
    {
        var vertices = new List<Vector3>();
        var triangles = new List<int>();
        var uv = new List<Vector2>();
        for (int i = 0; i <= 24; i++)
        {
            float t = i / 24f;
            float z = Mathf.Lerp(29f, 50f, t), y = Mathf.Lerp(10f, 4.5f, t);
            vertices.Add(new Vector3(75f, y, z));
            vertices.Add(new Vector3(85f, y, z));
            uv.Add(new Vector2(0f, t * 4f)); uv.Add(new Vector2(1f, t * 4f));
            if (i < 24) Quad(triangles, i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
        }
        MeshObject("02 Gentle Downhill Ramp", "Downhill", vertices, triangles, uv, _cream, parent);
        foreach (float x in new[] { 75.1f, 84.9f })
            Rail(new Vector3(x, 10.8f, 29f), new Vector3(x, 5.3f, 50f), parent);
    }

    private static void CreateHalfPipe(Transform parent)
    {
        const int across = 40, length = 48;
        var vertices = new List<Vector3>();
        var triangles = new List<int>();
        var uv = new List<Vector2>();
        for (int z = 0; z <= length; z++)
        for (int x = 0; x <= across; x++)
        {
            float sx = Mathf.Lerp(-7.8f, 7.8f, x / (float)across);
            float wz = Mathf.Lerp(50f, 86f, z / (float)length);
            // The flat center joins the ramp without a step; the smooth banks form an actual U.
            float bank = Mathf.Max(0f, Mathf.Abs(sx) - 2f) / 5.8f;
            float y = Mathf.Lerp(4.5f, 3.8f, z / (float)length) + 4.8f * bank * bank;
            vertices.Add(new Vector3(Center + sx, y, wz));
            uv.Add(new Vector2(x / (float)across * 2f, z / (float)length * 6f));
            if (z < length && x < across)
            {
                int a = z * (across + 1) + x;
                Quad(triangles, a, a + across + 1, a + 1, a + across + 2);
            }
        }
        MeshObject("03 U-Shaped Banked Half-Pipe Trough", "HalfPipe", vertices, triangles, uv, _teal, parent);
        foreach (float side in new[] { -1f, 1f })
            Rail(new Vector3(Center + side * 7.8f, 9.45f, 50f), new Vector3(Center + side * 7.8f, 8.75f, 86f), parent);
    }

    private static void CreateMushroom(Transform parent)
    {
        Transform mushroom = Group("Bouncy Red Mushroom", parent);
        mushroom.position = new Vector3(80f, 11.2f, 114f);
        Transform visual = Group("Squash Visual", mushroom);
        Primitive("Ivory Stem", PrimitiveType.Cylinder, new Vector3(80f, 7f, 114f), new Vector3(1.7f, 3.8f, 1.7f), _cream, parent, false);
        GameObject cap = Primitive("Ruby Spotted Cap", PrimitiveType.Sphere, mushroom.position,
            new Vector3(6.4f, 1.25f, 6.4f), _red, visual, true);
        for (int i = 0; i < 9; i++)
        {
            float angle = i * Mathf.PI * 2f / 9f;
            Vector3 offset = new Vector3(Mathf.Cos(angle) * 2.15f, 0.51f, Mathf.Sin(angle) * 2.15f);
            Primitive("Cream Cap Spot", PrimitiveType.Sphere, mushroom.position + offset,
                new Vector3(0.62f, 0.1f, 0.62f), _cream, visual, false);
        }
        // A separate fixed trigger keeps the contact geometry stable while the visual squashes.
        Object.DestroyImmediate(cap.GetComponent<Collider>());
        BoxCollider solidCap = mushroom.gameObject.AddComponent<BoxCollider>();
        solidCap.center = new Vector3(0f, -0.05f, 0f);
        solidCap.size = new Vector3(5.6f, 0.65f, 5.6f);
        BoxCollider trigger = mushroom.gameObject.AddComponent<BoxCollider>();
        trigger.center = new Vector3(0f, 0.65f, 0f);
        trigger.size = new Vector3(5.7f, 1.1f, 5.7f);
        trigger.isTrigger = true;
        BounceMushroom bounce = mushroom.gameObject.AddComponent<BounceMushroom>();
        bounce.launchVelocity = new Vector3(0f, 10f, 7f);
        bounce.visual = visual;
    }

    private static void Deck(string name, Vector3 top, Vector2 size, Transform parent, bool grass)
    {
        Block(name, top - Vector3.up * 0.75f, new Vector3(size.x, 1.5f, size.y), _cream, parent);
        Block(name + " Surface", top - Vector3.up * 0.06f, new Vector3(size.x - 0.15f, 0.12f, size.y - 0.15f), grass ? _leaf : _teal, parent, false);
        foreach (float dx in new[] { -size.x * 0.35f, size.x * 0.35f })
        foreach (float dz in new[] { -size.y * 0.32f, size.y * 0.32f })
        {
            float height = Mathf.Max(0.5f, top.y - 3.2f);
            Primitive("Terrace Pillar", PrimitiveType.Cylinder, new Vector3(top.x + dx, 2.5f + height * 0.5f, top.z + dz),
                new Vector3(0.8f, height * 0.5f, 0.8f), _cream, parent, false);
        }
    }

    private static MeowballController CreatePlayer()
    {
        GameObject player = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        player.name = "Player Meowball";
        player.transform.SetParent(_world);
        player.transform.position = new Vector3(80f, 11.05f, 20f);
        // Keep the physics root at unit scale; collider radius and visual diameter are explicit.
        player.GetComponent<SphereCollider>().radius = 0.85f;
        Object.DestroyImmediate(player.GetComponent<MeshRenderer>());
        Object.DestroyImmediate(player.GetComponent<MeshFilter>());
        Rigidbody rb = player.AddComponent<Rigidbody>();
        rb.mass = 1.5f;
        rb.linearDamping = 0.12f;
        rb.angularDamping = 0.22f;
        rb.interpolation = RigidbodyInterpolation.Interpolate;
        rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
        string physicsPath = Generated + "/Ball Grip.physicMaterial";
        PhysicsMaterial grip = AssetDatabase.LoadAssetAtPath<PhysicsMaterial>(physicsPath);
        if (grip == null)
        {
            grip = new PhysicsMaterial("Ball Grip");
            AssetDatabase.CreateAsset(grip, physicsPath);
        }
        grip.dynamicFriction = 0.45f;
        grip.staticFriction = 0.55f;
        grip.bounciness = 0.05f;
        grip.frictionCombine = PhysicsMaterialCombine.Maximum;
        EditorUtility.SetDirty(grip);
        player.GetComponent<SphereCollider>().sharedMaterial = grip;
        Material crystal = Lit("Iridescent Crystal", new Color(0.63f, 0.9f, 1f, 0.23f), 0.96f, 0.18f);
        Shader crystalShader = Shader.Find("Meowball/Iridescent Crystal");
        if (crystalShader != null) crystal.shader = crystalShader;
        else
        {
            crystal.SetFloat("_Surface", 1f);
            crystal.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            crystal.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            crystal.SetFloat("_ZWrite", 0f);
            crystal.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            crystal.SetOverrideTag("RenderType", "Transparent");
        }
        crystal.renderQueue = (int)RenderQueue.Transparent;
        EditorUtility.SetDirty(crystal);
        Primitive("Crystal Shell", PrimitiveType.Sphere, player.transform.position, Vector3.one * 1.7f, crystal, player.transform, false);
        Transform kittyRoot = Group("innerKitty (upright)", player.transform);
        kittyRoot.position = player.transform.position;
        GameObject kitty = PlaceModel("Assets/Models/Cats/cat-witch.glb", "Witch Kitty", player.transform.position + Vector3.down * 0.60f,
            1.2f, kittyRoot, () => FallbackCat(kittyRoot));
        if (kitty != null) kitty.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
        var controller = player.AddComponent<MeowballController>();
        controller.innerKitty = kittyRoot;
        controller.kittyAnimator = kittyRoot.GetComponentInChildren<Animator>();
        return controller;
    }

    private static void CreateCamera(MeowballController player)
    {
        GameObject cameraObject = new GameObject("Main Camera");
        cameraObject.tag = "MainCamera";
        cameraObject.transform.SetParent(_world);
        Camera camera = cameraObject.AddComponent<Camera>();
        camera.nearClipPlane = 0.15f;
        camera.farClipPlane = 320f;
        camera.fieldOfView = 52f;
        camera.allowHDR = true;
        camera.clearFlags = CameraClearFlags.Skybox;
        cameraObject.AddComponent<AudioListener>();
        UniversalAdditionalCameraData data = cameraObject.AddComponent<UniversalAdditionalCameraData>();
        data.renderPostProcessing = true;
        data.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
        var follow = cameraObject.AddComponent<HamsterCamera>();
        follow.target = player.transform;
        follow.targetBody = player.GetComponent<Rigidbody>();
        follow.baseOffset = new Vector3(0f, 7.5f, -11.5f);
        follow.baseFov = 52f;
        cameraObject.transform.position = player.transform.position + follow.baseOffset;
        cameraObject.transform.LookAt(player.transform.position + Vector3.forward * 2f);
    }

    private static void CreateCandies(MeowballHud hud)
    {
        Transform stars = Group("Golden Star Candies", _world);
        Mesh mesh = StarMesh();
        float[] positions = { 25f, 35f, 43f, 53f, 61f, 69f, 77f, 84f, 103f, 109f, 122f, 128f };
        hud.totalStars = positions.Length;
        foreach (float z in positions)
        {
            float y = z == 122f ? 16f : CourseHeight(z) + 1.15f;
            var star = new GameObject("Star Candy • " + z);
            star.transform.SetParent(stars);
            star.transform.position = new Vector3(Center, y, z);
            star.AddComponent<MeshFilter>().sharedMesh = mesh;
            star.AddComponent<MeshRenderer>().sharedMaterial = _glow;
            SphereCollider trigger = star.AddComponent<SphereCollider>();
            trigger.radius = 0.8f;
            trigger.isTrigger = true;
            star.AddComponent<StarCandy>().hud = hud;
        }
    }

    private static float CourseHeight(float z)
    {
        if (z <= 29f) return 10f;
        if (z <= 50f) return Mathf.Lerp(10f, 4.5f, (z - 29f) / 21f);
        if (z <= 86f) return Mathf.Lerp(4.5f, 3.8f, (z - 50f) / 36f);
        if (z < 99f) return 3.8f;
        return z < 120f ? 10.8f : 11f;
    }

    private static void CreateFinish(MeowballHud hud, Transform parent)
    {
        PlaceModel("Assets/Models/Props/portal.glb", "Finish Fairy Portal", new Vector3(80f, 11f, 137f), 6f, parent,
            () => FallbackPortal(new Vector3(80f, 11f, 137f), parent));
        Transform trigger = Group("Finish Portal Trigger", parent);
        trigger.position = new Vector3(80f, 13.3f, 136.6f);
        BoxCollider collider = trigger.gameObject.AddComponent<BoxCollider>();
        collider.isTrigger = true;
        collider.size = new Vector3(6f, 4.6f, 2.4f);
        trigger.gameObject.AddComponent<FinishPortalTrigger>().hud = hud;
        CourseLabel("STARLIGHT FINISH", "A little courage goes a long way", new Vector3(80f, 18.2f, 139f), parent);
        foreach (float x in new[] { 72.3f, 87.7f })
        {
            PlaceModel("Assets/Models/Props/banner-red.glb", "Finish Banner", new Vector3(x, 11f, 134f), 4.4f, parent,
                () => FallbackBanner(new Vector3(x, 11f, 134f), parent));
        }
    }

    private static void DressValley(Terrain terrain)
    {
        Transform nature = Group("Valley Gardens", _world);
        var random = new System.Random(160601);
        for (int i = 0; i < 92; i++)
        {
            float z = 8f + (float)random.NextDouble() * 145f;
            float side = i % 2 == 0 ? -1f : 1f;
            float x = Center + side * (15f + (float)random.NextDouble() * 57f);
            Vector3 p = new Vector3(x, terrain.SampleHeight(new Vector3(x, 0f, z)), z);
            float height = 4f + (float)random.NextDouble() * 5.5f;
            GameObject tree = PlaceModel("Assets/Models/Props/tree.glb", "Valley Tree", p, height, nature,
                () => FallbackTree(p, height, nature));
            tree.transform.Rotate(0f, (float)random.NextDouble() * 360f, 0f, Space.World);
        }
        for (int i = 0; i < 72; i++)
        {
            float side = i % 2 == 0 ? -1f : 1f;
            float z = 12f + (float)random.NextDouble() * 132f;
            float x = Center + side * (10f + (float)random.NextDouble() * 9f);
            float y = terrain.SampleHeight(new Vector3(x, 0f, z));
            Material flower = i % 3 == 0 ? _pink : (i % 3 == 1 ? _gold : _cream);
            Primitive("Wildflower Patch", PrimitiveType.Sphere, new Vector3(x, y + 0.25f, z),
                new Vector3(0.6f, 0.5f, 0.6f), flower, nature, false);
        }
        for (int i = 0; i < 24; i++)
        {
            float side = i % 2 == 0 ? -1f : 1f;
            float x = Center + side * (25f + (float)random.NextDouble() * 40f);
            float z = 12f + (float)random.NextDouble() * 140f;
            float h = 1f + (float)random.NextDouble() * 2.5f;
            Primitive("Mossy Valley Boulder", PrimitiveType.Sphere, new Vector3(x, terrain.SampleHeight(new Vector3(x, 0f, z)) + h * 0.2f, z),
                new Vector3(h * 1.7f, h, h * 1.3f), _stone, nature, false);
        }
        // Authored props accent terraces, away from the ball's travel lane.
        foreach (float x in new[] { 74.2f, 85.8f })
            PlaceModel("Assets/Models/Props/banner-red.glb", "Start Banner", new Vector3(x, 10f, 25.5f), 3.6f, nature,
                () => FallbackBanner(new Vector3(x, 10f, 25.5f), nature));
        for (int i = 0; i < 5; i++)
        foreach (float side in new[] { -1f, 1f })
        {
            Vector3 p = new Vector3(80f + side * 11f, 2.35f, 34f + i * 7f);
            GameObject fence = PlaceModel("Assets/Models/Props/fence.glb", "Garden Fence", p, 1.4f, nature,
                () => FallbackFence(p, nature));
            fence.transform.rotation = Quaternion.Euler(0f, 90f, 0f);
        }
        Vector3 fountain = new Vector3(86.3f, 11f, 128f);
        PlaceModel("Assets/Models/Props/fountain-center.glb", "Finish Garden Fountain", fountain, 3f, nature,
            () => FallbackFountain(fountain, nature));
    }

    private static GameObject PlaceModel(string path, string name, Vector3 bottom, float height, Transform parent, Func<GameObject> fallback)
    {
        if (!Models.TryGetValue(path, out GameObject prefab))
        {
            prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            Models[path] = prefab;
        }
        if (prefab == null) return fallback();
        GameObject instance = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
        if (instance == null) return fallback();
        instance.name = name;
        instance.transform.SetParent(parent, false);
        instance.transform.position = bottom;
        instance.transform.rotation = Quaternion.identity;
        instance.transform.localScale = Vector3.one;
        Renderer[] renderers = instance.GetComponentsInChildren<Renderer>(true);
        if (renderers.Length == 0)
        {
            Object.DestroyImmediate(instance);
            return fallback();
        }
        Bounds bounds = renderers[0].bounds;
        foreach (Renderer renderer in renderers) bounds.Encapsulate(renderer.bounds);
        if (bounds.size.y < 0.001f)
        {
            Object.DestroyImmediate(instance);
            return fallback();
        }
        float scale = height / bounds.size.y;
        Vector3 offset = new Vector3(bounds.center.x, bounds.min.y, bounds.center.z) - instance.transform.position;
        instance.transform.localScale = Vector3.one * scale;
        instance.transform.position = bottom - offset * scale;
        // glTF props are decorative; only deliberate course colliders control gameplay.
        foreach (Collider collider in instance.GetComponentsInChildren<Collider>(true)) collider.enabled = false;
        foreach (Rigidbody body in instance.GetComponentsInChildren<Rigidbody>(true))
        {
            body.isKinematic = true;
            body.detectCollisions = false;
        }
        foreach (Renderer renderer in renderers)
        {
            Material[] materials = renderer.sharedMaterials;
            bool changed = false;
            for (int i = 0; i < materials.Length; i++)
            {
                if (materials[i] != null && materials[i].shader != null && materials[i].shader.name != "Hidden/InternalErrorShader") continue;
                materials[i] = _cream;
                changed = true;
            }
            if (changed) renderer.sharedMaterials = materials;
        }
        return instance;
    }

    private static GameObject FallbackCat(Transform parent)
    {
        Transform cat = Group("Primitive Witch Kitty", parent);
        Vector3 center = parent.position + Vector3.down * 0.1f;
        Primitive("Kitty Body", PrimitiveType.Sphere, center, new Vector3(0.63f, 0.74f, 0.52f), _stone, cat, false);
        Primitive("Kitty Head", PrimitiveType.Sphere, center + new Vector3(0f, 0.34f, 0f), Vector3.one * 0.58f, _stone, cat, false);
        for (int side = -1; side <= 1; side += 2)
        {
            Primitive("Kitty Ear", PrimitiveType.Cube, center + new Vector3(side * 0.2f, 0.64f, 0f), new Vector3(0.15f, 0.22f, 0.15f), _pink, cat, false)
                .transform.rotation = Quaternion.Euler(0f, 0f, side * -25f);
            Primitive("Kitty Eye", PrimitiveType.Sphere, center + new Vector3(side * 0.12f, 0.4f, 0.25f), Vector3.one * 0.08f, _gold, cat, false);
        }
        return cat.gameObject;
    }

    private static GameObject FallbackTree(Vector3 p, float h, Transform parent)
    {
        Transform tree = Group("Storybook Tree (fallback)", parent);
        tree.position = p;
        Primitive("Trunk", PrimitiveType.Cylinder, p + Vector3.up * h * 0.23f, new Vector3(h * 0.1f, h * 0.23f, h * 0.1f), _wood, tree, false);
        Primitive("Foliage", PrimitiveType.Sphere, p + Vector3.up * h * 0.68f, new Vector3(h * 0.7f, h * 0.66f, h * 0.7f), _leaf, tree, false);
        return tree.gameObject;
    }

    private static GameObject FallbackBanner(Vector3 p, Transform parent)
    {
        Transform banner = Group("Red Banner (fallback)", parent);
        banner.position = p;
        Primitive("Banner Pole", PrimitiveType.Cylinder, p + Vector3.up * 1.9f, new Vector3(0.12f, 1.9f, 0.12f), _gold, banner, false);
        Block("Red Silk", p + new Vector3(0.55f, 3f, 0f), new Vector3(1f, 1.2f, 0.07f), _red, banner, false);
        return banner.gameObject;
    }

    private static GameObject FallbackFence(Vector3 p, Transform parent)
    {
        Transform fence = Group("Garden Fence (fallback)", parent);
        fence.position = p;
        for (int side = -1; side <= 1; side += 2)
            Block("Fence Post", p + new Vector3(side * 1.5f, 0.65f, 0f), new Vector3(0.15f, 1.3f, 0.15f), _cream, fence, false);
        Block("Fence Rail", p + Vector3.up * 0.8f, new Vector3(3f, 0.18f, 0.13f), _cream, fence, false);
        return fence.gameObject;
    }

    private static GameObject FallbackFountain(Vector3 p, Transform parent)
    {
        Transform fountain = Group("Garden Fountain (fallback)", parent);
        fountain.position = p;
        Primitive("Basin", PrimitiveType.Cylinder, p + Vector3.up * 0.3f, new Vector3(2.8f, 0.3f, 2.8f), _cream, fountain, false);
        Primitive("Water", PrimitiveType.Cylinder, p + Vector3.up * 0.62f, new Vector3(2.5f, 0.03f, 2.5f), _teal, fountain, false);
        Primitive("Center Spire", PrimitiveType.Sphere, p + Vector3.up * 1.2f, new Vector3(0.5f, 1.5f, 0.5f), _gold, fountain, false);
        return fountain.gameObject;
    }

    private static GameObject FallbackPortal(Vector3 p, Transform parent)
    {
        Transform portal = Group("Fairy Portal (fallback)", parent);
        portal.position = p;
        for (int i = 0; i < 17; i++)
        {
            float a = i * Mathf.PI / 16f;
            Primitive("Portal Arch Stone", PrimitiveType.Sphere, p + new Vector3(Mathf.Cos(a) * 2.7f, 2.4f + Mathf.Sin(a) * 2.7f, 0f),
                Vector3.one * 0.73f, i % 2 == 0 ? _cream : _gold, portal, false);
        }
        for (int side = -1; side <= 1; side += 2)
            Block("Portal Pillar", p + new Vector3(side * 2.7f, 1.2f, 0f), new Vector3(0.7f, 2.4f, 0.7f), _cream, portal, false);
        return portal.gameObject;
    }

    private static void CourseLabel(string title, string subtitle, Vector3 p, Transform parent)
    {
        TextMesh label = new GameObject(title).AddComponent<TextMesh>();
        label.transform.SetParent(parent);
        label.transform.position = p;
        label.anchor = TextAnchor.MiddleCenter;
        label.alignment = TextAlignment.Center;
        label.fontSize = 64;
        label.characterSize = 0.055f;
        label.color = new Color(1f, 0.97f, 0.78f);
        label.text = title + "\n" + subtitle;
        label.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        // TextMesh uses the font's own material, which is supported by URP's unlit path.
        label.GetComponent<MeshRenderer>().sharedMaterial = label.font.material;
    }

    private static Mesh StarMesh()
    {
        var vertices = new List<Vector3>();
        var triangles = new List<int>();
        var uv = new List<Vector2>();
        vertices.Add(new Vector3(0f, 0f, -0.14f)); uv.Add(Vector2.one * 0.5f);
        vertices.Add(new Vector3(0f, 0f, 0.14f)); uv.Add(Vector2.one * 0.5f);
        for (int i = 0; i < 10; i++)
        {
            float a = Mathf.PI * 0.5f + i * Mathf.PI / 5f, radius = i % 2 == 0 ? 0.65f : 0.3f;
            Vector3 p = new Vector3(Mathf.Cos(a) * radius, Mathf.Sin(a) * radius, -0.14f);
            vertices.Add(p); vertices.Add(new Vector3(p.x, p.y, 0.14f));
            uv.Add(new Vector2(p.x, p.y)); uv.Add(new Vector2(p.x, p.y));
        }
        for (int i = 0; i < 10; i++)
        {
            int a = 2 + i * 2, b = 2 + ((i + 1) % 10) * 2;
            triangles.AddRange(new[] { 0, b, a, 1, a + 1, b + 1, a, b, a + 1, a + 1, b, b + 1 });
        }
        return SaveMesh("StarCandy", vertices, triangles, uv);
    }

    private static void MeshObject(string name, string assetName, List<Vector3> vertices, List<int> triangles, List<Vector2> uv, Material material, Transform parent)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent);
        Mesh mesh = SaveMesh(assetName, vertices, triangles, uv);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        go.AddComponent<MeshRenderer>().sharedMaterial = material;
        go.AddComponent<MeshCollider>().sharedMesh = mesh;
    }

    private static Mesh SaveMesh(string name, List<Vector3> vertices, List<int> triangles, List<Vector2> uv)
    {
        string path = Generated + "/Meshes/" + name + ".asset";
        Mesh mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
        if (mesh == null)
        {
            mesh = new Mesh { name = name };
            AssetDatabase.CreateAsset(mesh, path);
        }
        mesh.Clear();
        mesh.SetVertices(vertices);
        mesh.SetTriangles(triangles, 0);
        mesh.SetUVs(0, uv);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        EditorUtility.SetDirty(mesh);
        return mesh;
    }

    private static void Quad(List<int> triangles, int a, int b, int c, int d)
    {
        triangles.AddRange(new[] { a, b, c, c, b, d });
    }

    private static Transform Group(string name, Transform parent)
    {
        Transform group = new GameObject(name).transform;
        group.SetParent(parent, false);
        return group;
    }

    private static GameObject Block(string name, Vector3 p, Vector3 scale, Material material, Transform parent, bool collider = true)
    {
        return Primitive(name, PrimitiveType.Cube, p, scale, material, parent, collider);
    }

    private static GameObject Primitive(string name, PrimitiveType type, Vector3 p, Vector3 scale, Material material, Transform parent, bool collider)
    {
        GameObject go = GameObject.CreatePrimitive(type);
        go.name = name;
        go.transform.SetParent(parent, false);
        go.transform.position = p;
        go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = material;
        if (!collider) Object.DestroyImmediate(go.GetComponent<Collider>());
        return go;
    }

    private static void Rail(Vector3 from, Vector3 to, Transform parent)
    {
        Beam("Honey Gold Safety Rail", from, to, 0.22f, _gold, parent, true);
        int posts = Mathf.Max(1, Mathf.CeilToInt(Vector3.Distance(from, to) / 4f));
        for (int i = 0; i <= posts; i++)
        {
            Vector3 p = Vector3.Lerp(from, to, i / (float)posts);
            Block("Porcelain Rail Post", p - Vector3.up * 0.35f, new Vector3(0.2f, 0.9f, 0.2f), _cream, parent);
        }
    }

    private static void Beam(string name, Vector3 from, Vector3 to, float width, Material material, Transform parent, bool collider)
    {
        GameObject go = Block(name, (from + to) * 0.5f, new Vector3(width, width, Vector3.Distance(from, to)), material, parent, collider);
        go.transform.rotation = Quaternion.LookRotation(to - from, Vector3.up);
    }

    private static void EnsureFolder(string path)
    {
        if (AssetDatabase.IsValidFolder(path)) return;
        string directory = Path.GetDirectoryName(path).Replace('\\', '/');
        EnsureFolder(directory);
        AssetDatabase.CreateFolder(directory, Path.GetFileName(path));
    }
}
