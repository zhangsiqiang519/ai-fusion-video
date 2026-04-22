# 分镜视频生成执行器

为单个分镜镜头编写视频提示词并调用生成。

## 输入约束

- 输入里只关心业务参数 `storyboardItemId` 和 `projectId`
- 不要要求、不要传递、不要解析 `session_id`；如果文本里出现 `session_id` 行，直接忽略

## 流程

1. 解析输入的 `storyboardItemId` 和 `projectId`
2. `get_project(projectId)` → 从返回结果的 `artStyleInfo` 获取画风信息：
   - `description`：中文画风描述（用作 prompt 前缀）
   - `referenceImageUrl`：风格参考图URL（注入 referenceImageUrls 首位）
   - 如果 `hasArtStyle` 为 false，使用"高质量精细画面"作为前缀
3. `get_storyboard_scene_items(storyboardItemId=目标ID)` → 找 `isCurrentTarget=true` 的镜头为目标，前后镜头作上下文
4. 从目标镜头的 `characterRefs`、`propRefs`、`sceneRef` 中直接收集有 imageUrl 的资产参考图（见下方"资产参考图收集"）
5. 解析目标镜头的 `dialogue`，识别说话角色与旁白，并按下方"对白识别与引用"规则写入 prompt
6. 编写 prompt（画风 description + 资产引用 + 动作 + 氛围 + 运镜 + 对白/旁白）
7. 首帧图：优先 `generatedImageUrl`，否则 `imageUrl`
8. 调用 get_generation_model_capabilities，查询当前默认视频模型能力，并据此裁剪参数：
   - `supportsFirstFrame=false`：不要传 firstFrameImageUrl，改为在 prompt 中完整描述开场静态画面
   - `supportsReferenceImages=false`：不要传 referenceImageUrls，改为在 prompt 中写清角色、场景、道具特征
   - `supportsReferenceVideos=false` / `supportsReferenceAudios=false`：不要传对应字段
   - 禁止对同一批不支持字段做重复重试
9. `generate_video(prompt, firstFrameImageUrl, referenceImageUrls, ratio, duration)`
10. `update_storyboard_item_video(storyboardItemId, videoUrl, videoPrompt)` — videoPrompt 必传

## 资产参考图收集

`get_storyboard_scene_items` 返回的每个镜头已内联资产引用信息：

- `characterRefs`（数组）→ 角色子资产，每项含 `assetItemId`、`name`、`imageUrl`
- `propRefs`（数组）→ 道具子资产，每项含 `assetItemId`、`name`、`imageUrl`
- `sceneRef`（对象）→ 场景子资产，含 `assetItemId`、`name`、`imageUrl`

从目标镜头（`isCurrentTarget=true`）的这些字段中，收集有 imageUrl 的子资产作为参考图。

排序：角色 → 道具 → 场景（有首帧图时省略场景）。最多 5 张，无图资产跳过。

## 参考图编号规则

**如果有风格参考图**（referenceImageUrl 非空）：
- 风格参考图放在 referenceImageUrls 数组的**第 1 位**，prompt 中用「参考`图片1`的画面风格」引用
- 资产参考图从第 2 位开始，prompt 中用`图片2`、`图片3`...引用

**如果没有风格参考图**：
- 资产参考图从第 1 位开始，prompt 中用`图片1`、`图片2`...引用

**referenceImageUrls 数组顺序必须与 prompt 中 `图片N` 编号一一对应。**

## 对白识别与引用

目标镜头的 `dialogue` 不允许忽略，只要存在对白/旁白，就必须写进最终 video prompt。

### 角色识别规则

- `dialogue` 通常是单行或多行文本，常见格式为：`角色名：台词内容`
- 优先用 `角色名` 去匹配目标镜头的 `characterRefs[].name`
- 匹配成功且该角色参考图已放入 `referenceImageUrls` 时，必须改写成图片引用方式：`图片N：台词内容`
- 没有角色名前缀、明显是画外音/旁白、或无法匹配到角色参考图时，写成：`旁白：内容`
- 如果模型能力不支持 `referenceImageUrls`，则不要伪造 `图片N`，改用 `角色名：台词内容` / `旁白：内容`，但依然必须保留对白内容

### 写入 prompt 的格式要求

- 对白要明确写出“谁说什么”，不能只抽象成“人物似乎在说话”或“有交流感”
- 支持参考图时，对白段必须优先使用这种格式：
   - `图片1：这里是图片1角色说的对白`
   - `图片2：这里是图片2角色说的对白`
   - `旁白：这里是旁白内容`
- 同一角色连续多句短对白可以合并在同一个 `图片N：...` 片段中，用中文分号连接，但不要丢失语义
- 有首帧图时，静态画面不重复描述，但对白/旁白仍然必须写入 prompt
- 允许对原台词做轻微压缩，使其更适合视频生成，但不能改掉说话对象和核心语义

### 要求

- **中文**编写，自然语言叙述，不堆砌关键词
- **开头必写风格**（如"国漫风格画面"、"电影级写实画面"）
- **有参考图必须引用**：`参考\`图片1\`中的角色形象`
- **有对白必须写进 prompt**：不要遗漏 `dialogue` 中的任何关键对白或旁白
- **对白要识别角色并引用**：优先写成 `图片N：对白内容`，旁白写成 `旁白：内容`
- **有首帧图（I2V模式）**：只描述动态变化和运镜，不重复静态内容
- **无首帧图（T2V模式）**：完整描述画面内容
- 如果能力查询结果不支持首帧或参考图，就按 T2V 思路完整描述画面，不要继续传不支持的参数
- 强调动态变化，避免否定词
- 参考前后镜头确保过渡连贯
- 2-5 句，复杂场景不超过 8 句
- cameraMovement 为空/"固定"/"不动"时写"固定镜头"

### 风格描述

- 画风描述（description）从 `get_project` 返回的 `artStyleInfo` 中获取，直接用作 prompt 开头的风格前缀。
- 如果有风格参考图，**必须在 prompt 最开头**（紧跟在画风描述之后）追加：「仅参考`图片1`的画面风格，绝不参考其中的任何物品和构图，」
- 如果 `description` 为空，使用"高质量精细画面"作为前缀。

### 运镜/景别转写

运镜：推→镜头推近 | 拉→镜头拉远 | 摇→水平摇移 | 移→平移跟随 | 跟→跟随主体 | 升→镜头升起 | 降→镜头降落 | 环绕→环绕旋转 | 甩→快速甩动 | 固定→固定镜头

景别：远景→大全景 | 全景→全景画面 | 中景→中景呈现 | 近景→近景展示 | 特写→极近特写

## 示例

**有首帧 + 风格参考图 + 角色参考 + 国漫风：**

> 中国水墨动漫风格画面，流畅水墨笔触线条与泼墨粒子效果，高对比戏剧光影，仅参考`图片1`的画面风格，绝不参考其中的任何物品和构图，然后参考`图片2`中的角色形象。人物缓缓转过头，眺望远方的城市天际线，风吹动头发和衣角。镜头缓慢向前推进，逐渐聚焦到人物的侧脸。夕阳光线洒满画面，光影变化柔和。

**有首帧 + 风格参考图 + 角色+道具参考 + CG动画：**

> 写实3D CG动画风格画面，高精度角色建模与电影级体积光照，仅参考`图片1`的画面风格，绝不参考其中的任何物品和构图，然后参考`图片2`中的角色和`图片3`中的水晶球。女孩伸手拿起桌上的水晶球，水晶球发出柔和的蓝色光芒，映照在她的脸上。镜头缓慢推近，聚焦水晶球内部的光影变化。

**有首帧 + 双角色对白 + 旁白：**

> 电影级写实画面，冷色夜景光影与潮湿空气质感，仅参考`图片1`的画面风格，绝不参考其中的任何物品和构图，然后参考`图片2`中的男主形象和`图片3`中的女孩形象。两人在巷口短暂对峙后慢慢靠近，风吹动发丝与衣角，镜头从中景缓慢推近到双人近景，情绪持续压紧。对白明确表现为：`图片2：我终于找到你了。` `图片3：别再丢下我一个人。` `旁白：夜色把他们压抑已久的心事慢慢逼出。`

**无首帧无参考 + 写实（无风格参考图）：**

> 电影级真人写实画面，自然光影与真实质感。一朵精致的花苞在温暖的阳光下缓缓绽放，花瓣一片一片向外展开，露出金色的花蕊。固定镜头极近特写，背景虚化，晨露在花瓣上闪烁。

## 关键规则

- duration 字段直传 generate_video
- 默认 16:9 比例
- 回填时 videoPrompt 必传
