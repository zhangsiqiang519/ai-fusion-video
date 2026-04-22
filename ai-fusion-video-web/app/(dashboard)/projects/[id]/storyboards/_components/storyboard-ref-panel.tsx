"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Info,
  Camera,
  Clock,
  Film,
  Hash,
  Image as ImageIcon,
  MessageSquare,
  Move3d,
  Music,
  Volume2,
  FileText,
  Sparkles,
  Loader2,
  Users,
  MapPin,
  Package,
  ExternalLink,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/api/client";
import { assetApi } from "@/lib/api/asset";

import type { Asset, AssetItem } from "@/lib/api/asset";
import type { StoryboardItem, Storyboard, StoryboardScene } from "@/lib/api/storyboard";
import { BatchGenDialog } from "./batch-gen-dialog";
import type { AssetItemWithInfo, SelectedAssetItem } from "./batch-gen-dialog";
import { VideoGenDialog } from "./video-gen-dialog";
import { usePipelineStore } from "@/lib/store/pipeline-store";

// ========== 类型 ==========

interface SceneWithItems {
  scene: StoryboardScene;
  items: StoryboardItem[];
}

/** 带主资产名称和类型的子资产 */
interface AssetItemWithParent extends AssetItem {
  parentName: string;
  parentType: string;
}

/** 资产分组 */
interface GroupedAssets {
  characters: AssetItemWithParent[];
  scenes: AssetItemWithParent[];
  props: AssetItemWithParent[];
}

// ========== 常量 ==========

const typeConfig = {
  character: {
    label: "角色",
    icon: Users,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  scene: {
    label: "场景",
    icon: MapPin,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
  },
  prop: {
    label: "道具",
    icon: Package,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
} as const;

/** 安全解析 ID 数组（兼容后端返回的 JSON 字符串或原生数组） */
function parseIds(raw: number[] | string | null | undefined): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ========== 场次资产面板 ==========

function SceneAssetPanel({
  sceneGroup,
  projectId,
  storyboard,
}: {
  sceneGroup: SceneWithItems;
  projectId: number;
  storyboard: Storyboard;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [groupedAssets, setGroupedAssets] = useState<GroupedAssets>({
    characters: [],
    scenes: [],
    props: [],
  });
  const [showBatchGen, setShowBatchGen] = useState(false);
  const [showVideoGen, setShowVideoGen] = useState(false);

  // 直接从分镜 items 聚合子资产 ID（characterIds / sceneAssetItemId / propIds）
  // 批量查子资产详情，附带主资产名称做辅助展示
  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const characterItemIds = new Set<number>();
      const sceneItemIds = new Set<number>();
      const propItemIds = new Set<number>();

      for (const item of sceneGroup.items) {
        const charIds = parseIds(item.characterIds);
        charIds.forEach((id) => characterItemIds.add(id));
        if (item.sceneAssetItemId) sceneItemIds.add(item.sceneAssetItemId);
        const pIds = parseIds(item.propIds);
        pIds.forEach((id) => propItemIds.add(id));
      }

      const allItemIds = [
        ...characterItemIds,
        ...sceneItemIds,
        ...propItemIds,
      ];

      if (allItemIds.length === 0) {
        setGroupedAssets({ characters: [], scenes: [], props: [] });
        return;
      }

      // 批量获取子资产详情
      const results = await Promise.all(
        allItemIds.map((id) => assetApi.getItem(id).catch(() => null))
      );

      // 收集主资产ID用于查名称
      const parentAssetIds = new Set<number>();
      const itemMap = new Map<number, AssetItem>();
      for (const r of results) {
        if (!r) continue;
        itemMap.set(r.id, r);
        if (r.assetId) parentAssetIds.add(r.assetId);
      }

      // 批量获取主资产（用于获取名称和类型做辅助标注）
      const parentAssets = await Promise.all(
        Array.from(parentAssetIds).map((id) => assetApi.get(id).catch(() => null))
      );
      const parentInfoMap = new Map<number, { name: string; type: string }>();
      for (const a of parentAssets) {
        if (a) parentInfoMap.set(a.id, { name: a.name, type: a.type });
      }

      // 直接展示子资产，附带主资产名称和类型
      const toItemsWithParent = (ids: Set<number>): AssetItemWithParent[] => {
        const result: AssetItemWithParent[] = [];
        for (const itemId of ids) {
          const item = itemMap.get(itemId);
          if (!item) continue;
          const info = parentInfoMap.get(item.assetId);
          result.push({
            ...item,
            parentName: info?.name || "未知资产",
            parentType: info?.type || "unknown",
          });
        }
        return result;
      };

      setGroupedAssets({
        characters: toItemsWithParent(characterItemIds),
        scenes: toItemsWithParent(sceneItemIds),
        props: toItemsWithParent(propItemIds),
      });
    } catch (err) {
      console.error("加载场次资产失败:", err);
    } finally {
      setLoading(false);
    }
  }, [sceneGroup]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const allItems = [
    ...groupedAssets.characters,
    ...groupedAssets.scenes,
    ...groupedAssets.props,
  ];
  const hasAssets = allItems.length > 0;

  // 点击子资产时跳转到其主资产
  const handleItemClick = (item: AssetItemWithParent) => {
    router.push(`/projects/${projectId}/assets?highlight=${item.assetId}`);
  };

  const addPipeline = usePipelineStore((s) => s.addPipeline);
  const setNotificationOpen = usePipelineStore((s) => s.setNotificationOpen);

  // 构建传给 BatchGenDialog 的子资产列表
  const batchGenItems: AssetItemWithInfo[] = allItems.map((ai) => ({
    item: ai,
    parentName: ai.parentName,
    parentType: ai.parentType,
    assetId: ai.assetId,
  }));

  const handleBatchGenConfirm = (selectedItems: SelectedAssetItem[]) => {
    // 提取去重的主资产ID和选中的子资产ID
    const selectedAssetIds = [...new Set(selectedItems.map((s) => s.assetId))];
    const selectedAssetItemIds = selectedItems.map((s) => s.itemId);

    // 触发 Agent Pipeline
    addPipeline({
      label: `批量生图 (${selectedItems.length} 个子资产)`,
      projectId,
      request: {
        agentType: "asset_image_gen",
        projectId,
        context: {
          selectedAssetIds,
          selectedAssetItemIds,
        },
      },
      onComplete: () => {
        loadAssets();
      },
    });

    // 打开通知面板让用户看到进度
    setNotificationOpen(true);
  };

  /** 批量生视频确认 */
  const handleVideoGenConfirm = (selectedItemIds: number[]) => {
    addPipeline({
      label: `批量生视频 (${selectedItemIds.length} 个镜头)`,
      projectId,
      request: {
        agentType: "storyboard_video_gen",
        projectId,
        context: {
          selectedStoryboardItemIds: selectedItemIds,
          storyboardId: storyboard.id,
        },
      },
      onComplete: () => {
        // 视频生成完成后可能需要刷新分镜数据
      },
    });
    setNotificationOpen(true);
  };

  return (
    <div className="p-4 space-y-4">
      {/* 标题 */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <Camera className="h-3 w-3" /> 场次详情
        </h4>
        <p className="text-sm font-semibold">
          {sceneGroup.scene.sceneHeading ||
            `场次 ${sceneGroup.scene.sceneNumber || sceneGroup.scene.id}`}
        </p>
        {sceneGroup.scene.location && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {sceneGroup.scene.intExt && `${sceneGroup.scene.intExt} `}
            {sceneGroup.scene.location}
            {sceneGroup.scene.timeOfDay && ` · ${sceneGroup.scene.timeOfDay}`}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          {sceneGroup.items.length} 个镜头
        </p>
      </div>

      {/* 批量生图按钮 */}
      {hasAssets && (
        <button
          onClick={() => setShowBatchGen(true)}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all",
            "bg-linear-to-r from-cyan-600 to-blue-600 text-white",
            "hover:shadow-lg hover:shadow-cyan-500/20 hover:scale-[1.02]",
            "active:scale-[0.98]"
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          批量生图
        </button>
      )}

      {/* 批量生视频按钮 */}
      <button
        onClick={() => setShowVideoGen(true)}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all",
          "bg-linear-to-r from-purple-600 to-pink-600 text-white",
          "hover:shadow-lg hover:shadow-purple-500/20 hover:scale-[1.02]",
          "active:scale-[0.98]"
        )}
      >
        <Video className="h-3.5 w-3.5" />
        批量生视频
      </button>

      {/* 加载中 */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* 资产列表 */}
      {!loading && (
        <>
          {!hasAssets && (
            <div className="text-center py-6 border-t border-border/20 pt-4">
              <Package className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                该场次暂无关联资产
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                请先在剧本场次中设置角色、场景和道具
              </p>
            </div>
          )}

          {/* 按类型分组展示 */}
          {(
            [
              ["character", groupedAssets.characters],
              ["scene", groupedAssets.scenes],
              ["prop", groupedAssets.props],
            ] as [keyof typeof typeConfig, AssetItemWithParent[]][]
          ).map(
            ([type, items]) =>
              items.length > 0 && (
                <AssetItemGroup
                  key={type}
                  type={type}
                  items={items}
                  onItemClick={handleItemClick}
                />
              )
          )}
        </>
      )}

      {/* 批量生图弹窗 — 传入子资产列表 */}
      <BatchGenDialog
        key={showBatchGen ? "batch-gen-open" : "batch-gen-closed"}
        open={showBatchGen}
        onClose={() => setShowBatchGen(false)}
        assetItems={batchGenItems}
        onConfirm={handleBatchGenConfirm}
      />

      {/* 批量生视频弹窗 */}
      <VideoGenDialog
        key={showVideoGen ? "video-gen-open" : "video-gen-closed"}
        open={showVideoGen}
        onClose={() => setShowVideoGen(false)}
        items={sceneGroup.items}
        onConfirm={handleVideoGenConfirm}
      />
    </div>
  );
}

/** 子资产分组展示 */
function AssetItemGroup({
  type,
  items,
  onItemClick,
}: {
  type: keyof typeof typeConfig;
  items: AssetItemWithParent[];
  onItemClick: (item: AssetItemWithParent) => void;
}) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className="border-t border-border/20 pt-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
        <Icon className={cn("h-3 w-3", config.color)} />
        {config.label}
        <span className="text-[10px] font-normal text-muted-foreground/60 ml-auto">
          {items.length}
        </span>
      </h4>
      <div className="space-y-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick(item)}
            className={cn(
              "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left group",
              "hover:bg-muted/30"
            )}
          >
            {/* 缩略图 */}
            <div className="h-10 w-10 rounded-lg bg-muted/30 border border-border/10 overflow-hidden shrink-0 flex items-center justify-center">
              {item.imageUrl ? (
                <img
                  src={resolveMediaUrl(item.imageUrl) || ""}
                  alt={item.name || item.parentName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Icon
                  className={cn("h-4 w-4 text-muted-foreground/30")}
                />
              )}
            </div>
            {/* 信息 */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">
                {item.name || item.parentName}
              </p>
              <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                {item.parentName}
              </p>
            </div>
            {/* 跳转图标 */}
            <ExternalLink className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ========== 镜头详情（保留原有） ==========

function ItemDetail({ item, projectId }: { item: StoryboardItem; projectId: number }) {
  const router = useRouter();
  const detailRows: {
    icon: typeof Info;
    label: string;
    value: string | null;
  }[] = [
    { icon: Hash, label: "镜号", value: item.shotNumber },
    { icon: Camera, label: "景别", value: item.shotType },
    {
      icon: Clock,
      label: "时长",
      value: item.duration ? `${item.duration}s` : null,
    },
    { icon: Move3d, label: "镜头运动", value: item.cameraMovement },
    { icon: Camera, label: "机位角度", value: item.cameraAngle },
    { icon: Camera, label: "焦距", value: item.focalLength },
    { icon: Film, label: "转场", value: item.transition },
  ];

  // ===== 加载镜头关联资产 =====
  const [linkedAssets, setLinkedAssets] = useState<{
    characters: (Asset & { items: AssetItem[] })[];
    scenes: (Asset & { items: AssetItem[] })[];
    props: (Asset & { items: AssetItem[] })[];
  }>({ characters: [], scenes: [], props: [] });
  const [assetsLoading, setAssetsLoading] = useState(false);

  const loadLinkedAssets = useCallback(async () => {
    // 解析各类子资产 ID
    const charItemIds = parseIds(item.characterIds);
    const sceneItemId = item.sceneAssetItemId && item.sceneAssetItemId > 0 ? item.sceneAssetItemId : null;
    const propItemIds = parseIds(item.propIds);

    const allItemIds = [...charItemIds, ...propItemIds];
    if (sceneItemId) allItemIds.push(sceneItemId);

    if (allItemIds.length === 0) {
      setLinkedAssets({ characters: [], scenes: [], props: [] });
      return;
    }

    setAssetsLoading(true);
    try {
      // 批量获取子资产详情
      const items = await Promise.all(
        allItemIds.map((id) => assetApi.getItem(id).catch(() => null))
      );

      // 收集主资产 ID（去重）
      const parentIds = new Set<number>();
      const itemMap = new Map<number, AssetItem>();
      for (const r of items) {
        if (!r) continue;
        itemMap.set(r.id, r);
        if (r.assetId) parentIds.add(r.assetId);
      }

      // 批量获取主资产 + 其子资产列表
      const parentResults = await Promise.all(
        Array.from(parentIds).map(async (id) => {
          try {
            const [asset, subItems] = await Promise.all([
              assetApi.get(id),
              assetApi.listItems(id),
            ]);
            return { ...asset, items: subItems || [] };
          } catch {
            return null;
          }
        })
      );

      const valid = parentResults.filter(
        (r): r is Asset & { items: AssetItem[] } => r !== null
      );

      // 按子资产ID → 主资产分类
      const charParentIds = new Set(charItemIds.map((id) => itemMap.get(id)?.assetId).filter((id): id is number => id != null));
      const sceneParentId = sceneItemId ? itemMap.get(sceneItemId)?.assetId : null;
      const propParentIds = new Set(propItemIds.map((id) => itemMap.get(id)?.assetId).filter((id): id is number => id != null));

      setLinkedAssets({
        characters: valid.filter((a) => charParentIds.has(a.id)),
        scenes: valid.filter((a) => a.id === sceneParentId),
        props: valid.filter((a) => propParentIds.has(a.id)),
      });
    } catch (err) {
      console.error("加载镜头关联资产失败:", err);
    } finally {
      setAssetsLoading(false);
    }
  }, [item.characterIds, item.sceneAssetItemId, item.propIds]);

  useEffect(() => {
    loadLinkedAssets();
  }, [loadLinkedAssets]);

  const hasLinkedAssets =
    linkedAssets.characters.length > 0 ||
    linkedAssets.scenes.length > 0 ||
    linkedAssets.props.length > 0;

  return (
    <div className="p-4 space-y-5">
      {/* 标题 */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Info className="h-3 w-3" /> 镜头详情
        </h4>
      </div>

      {/* 预览图 */}
      {(item.imageUrl ||
        item.referenceImageUrl ||
        item.generatedImageUrl) && (
        <div className="rounded-lg overflow-hidden border border-border/20">
          <img
            src={
              (resolveMediaUrl(item.generatedImageUrl ||
                item.imageUrl ||
                item.referenceImageUrl) as string)
            }
            alt="镜头画面"
            className="w-full aspect-video object-cover"
          />
        </div>
      )}

      {/* 基础属性 */}
      <div className="space-y-2">
        {detailRows.map(
          ({ icon: AttrIcon, label, value }) =>
            value && (
              <div key={label} className="flex items-center gap-2 text-xs">
                <AttrIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium ml-auto truncate max-w-[140px]">
                  {value}
                </span>
              </div>
            )
        )}
      </div>

      {/* 画面内容 */}
      {item.content && (
        <div className="border-t border-border/20 pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ImageIcon className="h-3 w-3" /> 画面内容
          </h4>
          <p className="text-xs text-foreground/80 leading-relaxed">
            {item.content}
          </p>
        </div>
      )}

      {/* 场景预期 */}
      {item.sceneExpectation && (
        <div className="border-t border-border/20 pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            场景预期
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            {item.sceneExpectation}
          </p>
        </div>
      )}

      {/* 对白 / 旁白 */}
      {item.dialogue && (
        <div className="border-t border-border/20 pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3" /> 对白 / 旁白
          </h4>
          <p className="text-xs text-foreground/80 leading-relaxed italic">
            「{item.dialogue}」
          </p>
        </div>
      )}

      {/* 音效 & 音乐 */}
      {(item.soundEffect || item.music || item.sound) && (
        <div className="border-t border-border/20 pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Volume2 className="h-3 w-3" /> 声音
          </h4>
          <div className="space-y-1.5">
            {item.sound && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">声音:</span>
                <span>{item.sound}</span>
              </div>
            )}
            {item.soundEffect && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">音效:</span>
                <span>{item.soundEffect}</span>
              </div>
            )}
            {item.music && (
              <div className="flex items-center gap-1.5 text-xs">
                <Music className="h-3 w-3 text-muted-foreground shrink-0" />
                <span>{item.music}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 参考图 */}
      {item.referenceImageUrl && (
        <div className="border-t border-border/20 pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ImageIcon className="h-3 w-3" /> 参考图
          </h4>
          <div className="rounded-lg overflow-hidden border border-border/20">
            <img
              src={resolveMediaUrl(item.referenceImageUrl) || ""}
              alt="参考图"
              className="w-full aspect-video object-cover"
            />
          </div>
        </div>
      )}

      {/* 备注 */}
      {item.remark && (
        <div className="border-t border-border/20 pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText className="h-3 w-3" /> 备注
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {item.remark}
          </p>
        </div>
      )}

      {/* ===== 关联资产 ===== */}
      {assetsLoading && (
        <div className="border-t border-border/20 pt-4 flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!assetsLoading && hasLinkedAssets && (
        <div className="border-t border-border/20 pt-4 space-y-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Users className="h-3 w-3" /> 关联资产
          </h4>

          {(
            [
              ["character", linkedAssets.characters],
              ["scene", linkedAssets.scenes],
              ["prop", linkedAssets.props],
            ] as [keyof typeof typeConfig, (Asset & { items: AssetItem[] })[]][]
          ).map(
            ([type, assets]) =>
              assets.length > 0 && (
                <LinkedAssetGroup
                  key={type}
                  type={type}
                  assets={assets}
                  onAssetClick={(id) =>
                    router.push(
                      `/projects/${projectId}/assets?highlight=${id}`
                    )
                  }
                />
              )
          )}
        </div>
      )}
    </div>
  );
}

/** 关联资产分组展示（含子资产图片） */
function LinkedAssetGroup({
  type,
  assets,
  onAssetClick,
}: {
  type: keyof typeof typeConfig;
  assets: (Asset & { items: AssetItem[] })[];
  onAssetClick: (id: number) => void;
}) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div>
      <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Icon className={cn("h-3 w-3", config.color)} />
        {config.label}
        <span className="text-[10px] font-normal text-muted-foreground/60 ml-auto">
          {assets.length}
        </span>
      </h5>
      <div className="space-y-3">
        {assets.map((asset) => (
          <div key={asset.id} className="space-y-2">
            {/* 资产标题行 */}
            <button
              onClick={() => onAssetClick(asset.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left group",
                "hover:bg-muted/30"
              )}
            >
              <div className="h-9 w-9 rounded-lg bg-muted/30 border border-border/10 overflow-hidden shrink-0 flex items-center justify-center">
                {asset.coverUrl ? (
                  <img
                    src={resolveMediaUrl(asset.coverUrl) || ""}
                    alt={asset.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{asset.name}</p>
                {asset.description && (
                  <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                    {asset.description}
                  </p>
                )}
              </div>
              <ExternalLink className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>

            {/* 子资产图片网格 */}
            {asset.items.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 px-1">
                {asset.items
                  .filter((sub) => sub.imageUrl)
                  .slice(0, 6)
                  .map((sub) => (
                    <div
                      key={sub.id}
                      className="aspect-square rounded-lg overflow-hidden border border-border/10 bg-muted/20"
                      title={sub.name || undefined}
                    >
                      <img
                        src={resolveMediaUrl(sub.imageUrl) || ""}
                        alt={sub.name || "子资产"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== 分镜概览（保留原有） ==========

function StoryboardOverview({
  storyboard,
  items,
}: {
  storyboard: Storyboard;
  items: StoryboardItem[];
}) {
  const totalDuration = items.reduce(
    (sum, item) => sum + (item.duration || 0),
    0
  );
  const withImage = items.filter(
    (i) => i.imageUrl || i.generatedImageUrl || i.referenceImageUrl
  ).length;

  return (
    <div className="p-4 space-y-5">
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Info className="h-3 w-3" /> 分镜概览
        </h4>
        <p className="text-sm font-semibold mb-1">
          {storyboard.title || "分镜表"}
        </p>
        {storyboard.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {storyboard.description}
          </p>
        )}
      </div>

      {/* 统计 */}
      <div className="border-t border-border/20 pt-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          统计
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2.5 rounded-lg bg-muted/20">
            <p className="text-lg font-bold text-primary">{items.length}</p>
            <p className="text-[10px] text-muted-foreground">总镜头数</p>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-muted/20">
            <p className="text-lg font-bold text-cyan-400">
              {totalDuration > 0 ? `${totalDuration}s` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">总时长</p>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-muted/20">
            <p className="text-lg font-bold text-amber-400">{withImage}</p>
            <p className="text-[10px] text-muted-foreground">有画面</p>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-muted/20">
            <p className="text-lg font-bold text-violet-400">
              {items.length - withImage}
            </p>
            <p className="text-[10px] text-muted-foreground">无画面</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== 主面板 ==========

export function StoryboardRefPanel({
  storyboard,
  items,
  selectedItem,
  activeSceneGroup,
  projectId,
}: {
  storyboard: Storyboard;
  items: StoryboardItem[];
  selectedItem: StoryboardItem | null;
  activeSceneGroup?: SceneWithItems | null;
  projectId: number;
}) {
  return (
    <div className="w-full lg:w-72 border-l border-border/20 flex flex-col shrink-0 bg-card/20 overflow-y-auto h-full">
      {selectedItem ? (
        <>
          <ItemDetail item={selectedItem} projectId={projectId} />
          {activeSceneGroup && (
            <>
              <div className="mx-4 border-t border-border/30" />
              <SceneAssetPanel
                sceneGroup={activeSceneGroup}
                projectId={projectId}
                storyboard={storyboard}
              />
            </>
          )}
        </>
      ) : activeSceneGroup ? (
        <SceneAssetPanel
          sceneGroup={activeSceneGroup}
          projectId={projectId}
          storyboard={storyboard}
        />
      ) : (
        <StoryboardOverview storyboard={storyboard} items={items} />
      )}
    </div>
  );
}
