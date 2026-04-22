package com.stonewu.fusion.service.generation;

import cn.hutool.json.JSONUtil;
import com.stonewu.fusion.common.BusinessException;
import com.stonewu.fusion.entity.ai.AiModel;
import com.stonewu.fusion.entity.generation.ImageTask;
import com.stonewu.fusion.entity.generation.VideoTask;
import com.stonewu.fusion.service.ai.ModelPresetService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GenerationModelCapabilityServiceTests {

        private final GenerationModelCapabilityService service = new GenerationModelCapabilityService(null, new ModelPresetService());

    @Test
    void shouldMarkOpenAiImageModelAsNoReferenceImageSupport() {
        AiModel model = AiModel.builder()
                .name("GPT Image 1")
                .code("gpt-image-1")
                .build();

        GenerationModelCapabilityService.ImageModelCapability capability = service.resolveImageCapability(model, "openai_compatible");

        assertFalse(capability.supportsReferenceImages());
        assertEquals(0, capability.minReferenceImages());
        assertEquals(0, capability.maxReferenceImages());
    }

    @Test
    void shouldRejectReferenceImagesForOpenAiImageModel() {
        AiModel model = AiModel.builder()
                .name("GPT Image 1")
                .code("gpt-image-1")
                .build();
        ImageTask task = ImageTask.builder()
                .refImageUrls(JSONUtil.toJsonStr(List.of("https://example.com/ref.png")))
                .build();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.validateImageTask(model, task, "openai_compatible"));

        assertTrue(ex.getMessage().contains("不支持参考图输入"));
    }

        @Test
        void shouldUsePresetCapabilityWhenModelConfigDoesNotContainNewFields() {
                GenerationModelCapabilityService serviceWithPreset = new GenerationModelCapabilityService(null, new ModelPresetService() {
                        @Override
                        public String getPresetConfig(String code) {
                                if (!"doubao-seedream-3-0-t2i-250415".equals(code)) {
                                        return null;
                                }
                                return """
                                                {
                                                  "supportReferenceImages": false,
                                                  "minReferenceImages": 0,
                                                  "maxReferenceImages": 0
                                                }
                                                """;
                        }
                });

                AiModel model = AiModel.builder()
                                .name("Seedream 3.0")
                                .code("doubao-seedream-3-0-t2i-250415")
                                .config("{\"defaultWidth\":2048,\"defaultHeight\":2048}")
                                .build();

                GenerationModelCapabilityService.ImageModelCapability capability = serviceWithPreset.resolveImageCapability(model, "volcengine");

                assertFalse(capability.supportsReferenceImages());
                assertEquals(0, capability.maxReferenceImages());
        }

    @Test
    void shouldRejectFirstFrameForT2vGoogleFlowModel() {
        AiModel model = AiModel.builder()
                .name("Veo T2V Fast")
                .code("veo_3_1_t2v_fast")
                .build();
        VideoTask task = VideoTask.builder()
                .firstFrameImageUrl("https://example.com/first.png")
                .build();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.validateVideoTask(model, task, "GoogleFlowReverseApi"));

        assertTrue(ex.getMessage().contains("不支持首帧图输入"));
    }

    @Test
    void shouldRequireTwoImagesForInterpolationModel() {
        AiModel model = AiModel.builder()
                .name("Interpolation Lite")
                .code("veo_3_1_interpolation_lite")
                .build();
        VideoTask task = VideoTask.builder()
                .firstFrameImageUrl("https://example.com/first.png")
                .build();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.validateVideoTask(model, task, "GoogleFlowReverseApi"));

        assertTrue(ex.getMessage().contains("至少需要 2 张图片输入"));
    }

    @Test
    void shouldRejectLastFrameForSeedanceProFast() {
        AiModel model = AiModel.builder()
                .name("Seedance 1.0 Pro Fast")
                .code("doubao-seedance-1-0-pro-fast-251015")
                .build();
        VideoTask task = VideoTask.builder()
                .lastFrameImageUrl("https://example.com/last.png")
                .build();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.validateVideoTask(model, task, "volcengine"));

        assertTrue(ex.getMessage().contains("不支持尾帧图输入"));
    }

    @Test
    void shouldAllowSeedance20ReferenceMedia() {
        AiModel model = AiModel.builder()
                .name("Seedance 2.0")
                .code("doubao-seedance-2-0-260128")
                .build();
        VideoTask task = VideoTask.builder()
                .firstFrameImageUrl("https://example.com/first.png")
                .lastFrameImageUrl("https://example.com/last.png")
                .referenceImageUrls(JSONUtil.toJsonStr(List.of("https://example.com/ref-1.png")))
                .referenceVideoUrls(JSONUtil.toJsonStr(List.of("https://example.com/ref-1.mp4")))
                .referenceAudioUrls(JSONUtil.toJsonStr(List.of("https://example.com/ref-1.mp3")))
                .build();

        service.validateVideoTask(model, task, "volcengine");
    }
}