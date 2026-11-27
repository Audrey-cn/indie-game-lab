# Meowball · Fairy Valley Stage 1

1. Open this folder in **Unity Hub** with **Unity 6 (6000.3.26f1)**. Let Package Manager finish importing URP, glTFast and the supplied models.
2. Choose **Meowball → Build Fairy Valley Vertical Slice**, then press **Play**.

Roll with **WASD / arrow keys** or a **gamepad left stick**. Follow the gold stars down the ramp and curved half-pipe, board the moving lift, then roll onto the red mushroom to reach the finish portal. Stars give **+2 seconds** and a temporary speed boost. **R** restarts the stage; falling returns you to the start. The HUD shows time, stars, speed, and the stage result.

The generator creates `Assets/Scenes/FairyValleyStage1.unity`, reusable assets in `Assets/MeowballGenerated/`, a URP renderer/pipeline and Volume, and enables the scene in Build Settings. Running it again replaces the generated scene and updates those assets. Imported GLB models are fitted to their intended sizes; missing or not-yet-imported models receive primitive stand-ins. Rebuild after imports finish to use the models.

For command-line generation (close the project in the editor first):

```sh
"/path/to/Unity" -batchmode -nographics -quit \
  -projectPath "/absolute/path/to/meowball-unity" \
  -executeMethod MeowballSceneBuilder.BuildVerticalSlice \
  -logFile "/absolute/path/to/meowball-build.log"
```

This generates the scene; it does not export a standalone player. An installed, licensed editor and access to the package registry on first import are required.

Optional checks after generation: run `MeowballValidation.ValidateGeneratedScene` with the same batch arguments. For a Play Mode physics smoke check, run `MeowballValidation.RunGameplaySmokeTest` and **omit `-quit`**; the check exits with code 0 on success or 1 on failure.
