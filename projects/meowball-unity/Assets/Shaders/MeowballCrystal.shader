Shader "Meowball/Iridescent Crystal"
{
    Properties
    {
        _BaseColor ("Crystal Tint", Color) = (0.63, 0.9, 1, 0.2)
        _Smoothness ("Smoothness", Range(0, 1)) = 0.96
        _Metallic ("Metallic", Range(0, 1)) = 0.18
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" "Queue"="Transparent" }
        Pass
        {
            Name "Crystal"
            Tags { "LightMode"="UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Back
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;
                half _Smoothness;
                half _Metallic;
            CBUFFER_END
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                half3 normalWS : TEXCOORD1;
                half fogFactor : TEXCOORD2;
            };
            Varyings Vert(Attributes input)
            {
                Varyings output;
                VertexPositionInputs position = GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS = position.positionCS;
                output.positionWS = position.positionWS;
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.fogFactor = ComputeFogFactor(position.positionCS.z);
                return output;
            }
            half4 Frag(Varyings input) : SV_Target
            {
                half3 normal = normalize(input.normalWS);
                half3 view = GetWorldSpaceNormalizeViewDir(input.positionWS);
                half facing = saturate(dot(normal, view));
                half rim = pow(1.0h - facing, 2.4h);
                half3 rainbow = 0.65h + 0.35h * cos(6.283185h * (facing * 1.6h + half3(0.0h, 0.33h, 0.67h)));
                Light sun = GetMainLight();
                half3 halfDirection = normalize(sun.direction + view);
                half glint = pow(saturate(dot(normal, halfDirection)), 160.0h);
                half3 color = lerp(_BaseColor.rgb, rainbow, rim * 0.8h) + rim * 0.28h + glint * sun.color * 2.0h;
                color = MixFog(color, input.fogFactor);
                return half4(color, saturate(_BaseColor.a * 0.6h + rim * 0.62h + glint * 0.4h));
            }
            ENDHLSL
        }
    }
    FallBack "Universal Render Pipeline/Lit"
}
