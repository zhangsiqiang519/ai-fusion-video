package com.stonewu.fusion.service.ai.provider;

import com.stonewu.fusion.controller.ai.vo.RemoteModelVO;
import com.stonewu.fusion.entity.ai.AiModel;
import io.agentscope.core.model.Model;
import lombok.RequiredArgsConstructor;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 提供统一的提供商调用入口。
 */
@Service
@RequiredArgsConstructor
public class AiProviderService {

    private final AiProviderContextFactory contextFactory;
    private final AiProviderRegistry providerRegistry;

    public ChatModel createChatModel(AiModel model) {
        AiProviderContext context = contextFactory.createForModel(model);
        return providerRegistry.getProvider(context).createChatModel(context);
    }

    public Model createAgentScopeModel(AiModel model) {
        AiProviderContext context = contextFactory.createForModel(model);
        return providerRegistry.getProvider(context).createAgentScopeModel(context);
    }

    public List<RemoteModelVO> listRemoteModels(Long apiConfigId) {
        AiProviderContext context = contextFactory.createForApiConfig(apiConfigId);
        return providerRegistry.getProvider(context).listRemoteModels(context);
    }
}