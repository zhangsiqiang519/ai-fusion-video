package com.stonewu.fusion.service.ai.provider;

import com.alibaba.cloud.ai.dashscope.api.DashScopeApi;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatModel;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.stonewu.fusion.controller.ai.vo.RemoteModelVO;
import io.agentscope.core.model.DashScopeChatModel.Builder;
import io.agentscope.core.model.Model;
import org.springframework.ai.chat.model.ChatModel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * DashScope 提供商。
 */
@Component
@Slf4j
public class DashScopeAiProvider extends AbstractAiProvider {

    @Override
    public boolean supports(String platform) {
        return platform != null && "dashscope".equalsIgnoreCase(platform);
    }

    @Override
    public ChatModel createChatModel(AiProviderContext context) {
        String apiKey = context.getApiKey();
        Map<String, Object> config = context.getConfig();
        String modelName = context.getModelName();

        requireApiKey(apiKey, "DashScope");

        DashScopeChatOptions options = DashScopeChatOptions.builder()
                .model(modelName)
                .build();
        applyDouble(config, "temperature", options::setTemperature);
        applyDouble(config, "topP", options::setTopP);
        applyInt(config, "maxTokens", options::setMaxTokens);

        return DashScopeChatModel.builder()
                .dashScopeApi(DashScopeApi.builder().apiKey(apiKey).build())
                .defaultOptions(options)
                .build();
    }

    @Override
    public Model createAgentScopeModel(AiProviderContext context) {
        Builder builder = io.agentscope.core.model.DashScopeChatModel.builder()
                .apiKey(context.getApiKey())
                .modelName(context.getModelName())
                .stream(true);
        if (isReasoningEnabled(context)) {
            builder.enableThinking(true);
        }
        return builder.build();
    }

    @Override
    public List<RemoteModelVO> listRemoteModels(AiProviderContext context) {
        requireApiKey(context.getApiKey(), "DashScope");
        String baseUrl = resolveApiBaseUrl(context.getBaseUrl());
        String url = joinUrl(baseUrl, "/models");
        log.info("[DashScopeAiProvider] 获取远程模型列表: {}", url);
        String response = executeGet(url, Map.of("Authorization", "Bearer " + context.getApiKey()));
        return parseDataArrayModels(response, "dashscope");
    }

    private String resolveApiBaseUrl(String baseUrl) {
        String resolvedBaseUrl = (baseUrl == null || baseUrl.isBlank())
                ? "https://dashscope.aliyuncs.com"
                : normalizeBaseUrl(baseUrl);
        return ensurePathSuffix(resolvedBaseUrl, "/compatible-mode/v1");
    }
}