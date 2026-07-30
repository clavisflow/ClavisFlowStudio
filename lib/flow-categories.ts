export const flowCategories = ["整形", "集計", "結合", "変換", "チェック", "抽出"] as const;

export type FlowCategory = (typeof flowCategories)[number];

export const flowCategoryLabels: Record<FlowCategory, string> = {
  整形: "データを整える",
  集計: "集計する",
  結合: "結合する",
  変換: "変換する",
  チェック: "チェックする",
  抽出: "抽出する",
};
