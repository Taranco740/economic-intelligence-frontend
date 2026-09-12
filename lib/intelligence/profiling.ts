export type ColumnProfile = {
  name: string;
  type: "number" | "date" | "boolean" | "text" | "empty";
  missing: number;
  distinct: number;
  samples: unknown[];
  min?: number;
  max?: number;
  mean?: number;
};
