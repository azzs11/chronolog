/**
 * Scores a gradient-boosted tree model exported from LightGBM (`Booster.dump_model()`).
 * Pure arithmetic: no LightGBM at run time.
 */

interface Leaf {
  leaf_value: number;
}
interface Split {
  split_feature: number;
  threshold: number;
  decision_type: string;
  default_left: boolean;
  missing_type: string;
  left_child: TreeNode;
  right_child: TreeNode;
}
export type TreeNode = Leaf | Split;

export interface TreeModel {
  /** Identifies the model in results, e.g. "rootrank-v1". */
  id: string;
  feature_names: string[];
  tree_info: Array<{ tree_structure: TreeNode }>;
  /** Where the model came from; shown to users next to its results. */
  trained_on?: string;
  rounds?: number;
  code_fingerprint?: string;
}

const isLeaf = (node: TreeNode): node is Leaf => 'leaf_value' in node;

function goesLeft(node: Split, value: number): boolean {
  const isMissing =
    (node.missing_type === 'NaN' && Number.isNaN(value)) || (node.missing_type === 'Zero' && value === 0);
  if (isMissing) return node.default_left;
  if (node.decision_type !== '<=') throw new Error(`Unsupported split type: ${node.decision_type}`);
  return value <= node.threshold;
}

function scoreTree(root: TreeNode, features: ArrayLike<number>): number {
  let node = root;
  while (!isLeaf(node)) {
    const value = features[node.split_feature] as number;
    node = goesLeft(node, value) ? node.left_child : node.right_child;
  }
  return node.leaf_value;
}

/** Raw model score for one feature vector (ordered as `model.feature_names`). */
export function predict(model: TreeModel, features: ArrayLike<number>): number {
  let total = 0;
  for (const tree of model.tree_info) total += scoreTree(tree.tree_structure, features);
  return total;
}
