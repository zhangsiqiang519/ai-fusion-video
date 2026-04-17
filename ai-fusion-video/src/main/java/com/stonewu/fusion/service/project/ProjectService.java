package com.stonewu.fusion.service.project;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.stonewu.fusion.common.PageResult;
import com.stonewu.fusion.common.BusinessException;
import com.stonewu.fusion.entity.asset.Asset;
import com.stonewu.fusion.entity.asset.AssetItem;
import com.stonewu.fusion.entity.project.Project;
import com.stonewu.fusion.entity.project.ProjectMember;
import com.stonewu.fusion.mapper.asset.AssetItemMapper;
import com.stonewu.fusion.mapper.asset.AssetMapper;
import com.stonewu.fusion.mapper.project.ProjectMapper;
import com.stonewu.fusion.mapper.project.ProjectMemberMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 项目服务
 */
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectMapper projectMapper;
    private final ProjectMemberMapper memberMapper;
    private final AssetMapper assetMapper;
    private final AssetItemMapper assetItemMapper;

    @Cacheable(value = "project", key = "#id")
    public Project getById(Long id) {
        Project project = projectMapper.selectById(id);
        if (project == null) throw new BusinessException("项目不存在: " + id);
        return project;
    }

    public PageResult<Project> page(int pageNo, int pageSize) {
        return PageResult.of(projectMapper.selectPage(new Page<>(pageNo, pageSize), null));
    }

    @Cacheable(value = "project", key = "'owner:' + #ownerType + ':' + #ownerId")
    public List<Project> listByOwner(Integer ownerType, Long ownerId) {
        return projectMapper.selectList(new LambdaQueryWrapper<Project>()
                .eq(Project::getOwnerType, ownerType)
                .eq(Project::getOwnerId, ownerId)
                .orderByDesc(Project::getCreateTime));
    }

    @CacheEvict(value = "project", allEntries = true)
    @Transactional
    public Project create(Project project) {
        projectMapper.insert(project);
        return project;
    }

    @CacheEvict(value = "project", allEntries = true)
    @Transactional
    public Project update(Project project) {
        getById(project.getId());
        projectMapper.updateById(project);
        return project;
    }

    @CacheEvict(value = "project", allEntries = true)
    @Transactional
    public void delete(Long id) {
        // 级联删除项目下的所有资产及其子项
        List<Asset> assets = assetMapper.selectList(
                new LambdaQueryWrapper<Asset>().eq(Asset::getProjectId, id));
        for (Asset asset : assets) {
            assetItemMapper.delete(
                    new LambdaQueryWrapper<AssetItem>().eq(AssetItem::getAssetId, asset.getId()));
        }
        if (!assets.isEmpty()) {
            assetMapper.delete(new LambdaQueryWrapper<Asset>().eq(Asset::getProjectId, id));
        }
        // 删除项目成员
        memberMapper.delete(new LambdaQueryWrapper<ProjectMember>().eq(ProjectMember::getProjectId, id));
        // 删除项目本身
        projectMapper.deleteById(id);
    }

    // ========== 成员管理 ==========

    public boolean isMember(Long projectId, Long userId) {
        return memberMapper.exists(new LambdaQueryWrapper<ProjectMember>()
                .eq(ProjectMember::getProjectId, projectId)
                .eq(ProjectMember::getUserId, userId));
    }

    @Cacheable(value = "projectMember", key = "#projectId")
    public List<ProjectMember> listMembers(Long projectId) {
        return memberMapper.selectList(
                new LambdaQueryWrapper<ProjectMember>().eq(ProjectMember::getProjectId, projectId));
    }

    @CacheEvict(value = "projectMember", allEntries = true)
    @Transactional
    public ProjectMember addMember(Long projectId, Long userId, Integer role) {
        if (isMember(projectId, userId)) {
            throw new BusinessException("该用户已是项目成员");
        }
        ProjectMember member = ProjectMember.builder()
                .projectId(projectId)
                .userId(userId)
                .role(role)
                .build();
        memberMapper.insert(member);
        return member;
    }

    @CacheEvict(value = "projectMember", allEntries = true)
    @Transactional
    public void removeMember(Long projectId, Long userId) {
        memberMapper.delete(new LambdaQueryWrapper<ProjectMember>()
                .eq(ProjectMember::getProjectId, projectId)
                .eq(ProjectMember::getUserId, userId));
    }
}
