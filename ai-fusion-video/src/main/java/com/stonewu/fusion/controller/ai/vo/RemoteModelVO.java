package com.stonewu.fusion.controller.ai.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 远程 API 返回的可用模型信息
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RemoteModelVO {

    /** 模型 ID（即模型 code） */
    private String id;

    /** 模型拥有者 */
    private String ownedBy;
}
