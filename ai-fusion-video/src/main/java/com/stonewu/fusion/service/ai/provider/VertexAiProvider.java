package com.stonewu.fusion.service.ai.provider;

import cn.hutool.core.util.StrUtil;
import com.google.cloud.vertexai.VertexAI;
import com.stonewu.fusion.common.BusinessException;
import com.stonewu.fusion.controller.ai.vo.RemoteModelVO;
import io.agentscope.core.model.GeminiChatModel;
import io.agentscope.core.model.Model;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.vertexai.gemini.VertexAiGeminiChatModel;
import org.springframework.ai.vertexai.gemini.VertexAiGeminiChatOptions;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Vertex AI / Gemini 提供商。
 */
@Component
@Slf4j
public class VertexAiProvider extends AbstractAiProvider {

    @Override
    public boolean supports(String platform) {
        if (platform == null) {
            return false;
        }
        String normalized = platform.toLowerCase();
        return "vertex_ai".equals(normalized) || "vertexai".equals(normalized) || "gemini".equals(normalized);
    }

    @Override
    public ChatModel createChatModel(AiProviderContext context) {
        String projectId = getProjectId(context);
        String location = getLocation(context);
        if (StrUtil.isBlank(projectId)) {
            throw new BusinessException("Vertex AI 模型缺少 projectId 配置");
        }

        VertexAiGeminiChatOptions.Builder optionsBuilder = VertexAiGeminiChatOptions.builder()
                .model(context.getModelName());
        applyDouble(context.getConfig(), "temperature", optionsBuilder::temperature);

        VertexAI vertexAI = new VertexAI.Builder()
                .setProjectId(projectId)
                .setLocation(location)
                .build();

        return VertexAiGeminiChatModel.builder()
                .vertexAI(vertexAI)
                .defaultOptions(optionsBuilder.build())
                .build();
    }

    @Override
    public Model createAgentScopeModel(AiProviderContext context) {
        GeminiChatModel.Builder builder = GeminiChatModel.builder()
                .modelName(context.getModelName())
                .streamEnabled(true);

        String projectId = getProjectId(context);
        if (StrUtil.isNotBlank(projectId)) {
            builder.project(projectId)
                    .location(getLocation(context))
                    .vertexAI(true);
        } else {
            requireApiKey(context.getApiKey(), "Gemini");
            builder.apiKey(context.getApiKey());
        }
        return builder.build();
    }

    @Override
    public List<RemoteModelVO> listRemoteModels(AiProviderContext context) {
        throw new BusinessException("平台 " + context.getPlatform() + " 暂不支持自动获取模型列表");
    }

    private String getProjectId(AiProviderContext context) {
        String projectId = getStr(context.getConfig(), "projectId", null);
        if (StrUtil.isNotBlank(projectId)) {
            return projectId;
        }
        return context.getApiConfig() != null ? context.getApiConfig().getAppId() : null;
    }

    private String getLocation(AiProviderContext context) {
        String location = getStr(context.getConfig(), "location", null);
        if (StrUtil.isNotBlank(location)) {
            return location;
        }
        if (context.getApiConfig() != null && StrUtil.isNotBlank(context.getApiConfig().getApiUrl())) {
            return context.getApiConfig().getApiUrl();
        }
        return "us-central1";
    }
}