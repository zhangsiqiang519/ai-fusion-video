package com.stonewu.fusion.service.ai;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.stonewu.fusion.common.PageResult;
import com.stonewu.fusion.common.BusinessException;
import com.stonewu.fusion.entity.ai.ApiConfig;
import com.stonewu.fusion.mapper.ai.ApiConfigMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ApiConfigService {

    private final ApiConfigMapper apiConfigMapper;

    @Transactional
    public Long createApiConfig(ApiConfig apiConfig) {
        if (apiConfig.getAutoAppendV1Path() == null) {
            apiConfig.setAutoAppendV1Path(true);
        }
        apiConfigMapper.insert(apiConfig);
        return apiConfig.getId();
    }

    @Transactional
    public void updateApiConfig(Long id, String name, String platform, String apiUrl,
                                 Boolean autoAppendV1Path,
                                 String apiKey, String appId, String appSecret,
                                 Long modelId, Integer status, String remark) {
        ApiConfig config = apiConfigMapper.selectById(id);
        if (config == null) throw new BusinessException(404, "API配置不存在");
        if (name != null) config.setName(name);
        if (platform != null) config.setPlatform(platform);
        if (apiUrl != null) config.setApiUrl(apiUrl);
        if (autoAppendV1Path != null) config.setAutoAppendV1Path(autoAppendV1Path);
        if (apiKey != null) config.setApiKey(apiKey);
        if (appId != null) config.setAppId(appId);
        if (appSecret != null) config.setAppSecret(appSecret);
        if (modelId != null) config.setModelId(modelId);
        if (status != null) config.setStatus(status);
        if (remark != null) config.setRemark(remark);
        apiConfigMapper.updateById(config);
    }

    @Transactional
    public void deleteApiConfig(Long id) {
        apiConfigMapper.deleteById(id);
    }

    public ApiConfig getById(Long id) {
        return apiConfigMapper.selectById(id);
    }

    public PageResult<ApiConfig> getPage(String name, String platform, Integer status, int pageNo, int pageSize) {
        LambdaQueryWrapper<ApiConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(name != null, ApiConfig::getName, name)
                .eq(platform != null, ApiConfig::getPlatform, platform)
                .eq(status != null, ApiConfig::getStatus, status)
                .orderByDesc(ApiConfig::getId);
        return PageResult.of(apiConfigMapper.selectPage(new Page<>(pageNo, pageSize), wrapper));
    }

    public List<ApiConfig> getEnabledList() {
        return apiConfigMapper.selectList(new LambdaQueryWrapper<ApiConfig>().eq(ApiConfig::getStatus, 1));
    }

    /**
     * 按平台标识获取启用的 API 配置列表
     */
    public List<ApiConfig> getListByPlatform(String platform) {
        return apiConfigMapper.selectList(new LambdaQueryWrapper<ApiConfig>()
                .eq(ApiConfig::getStatus, 1)
                .eq(ApiConfig::getPlatform, platform));
    }

    /**
     * 按多个平台标识获取启用的 API 配置列表
     */
    public List<ApiConfig> getListByPlatforms(List<String> platforms) {
        return apiConfigMapper.selectList(new LambdaQueryWrapper<ApiConfig>()
                .eq(ApiConfig::getStatus, 1)
                .in(ApiConfig::getPlatform, platforms));
    }
}
