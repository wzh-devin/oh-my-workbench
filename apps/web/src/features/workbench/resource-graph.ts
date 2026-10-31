import { activeAssets } from "@/features/assets/asset-rules"
import { Position, type Edge, type Node } from "@xyflow/react"
import { formatTime, type ConnectionStatus, type Workbench } from "./model"

export type ResourceNodeData = {
  title: string
  description: string
  detail: string
  kind: "workspace" | "mail" | "storage" | "todo"
  href: string
  status?: ConnectionStatus
}
export type ResourceNode = Node<ResourceNodeData, "resource">

/** 图只由真实来源记录派生，新增配置自然成为节点，连线只表示归属关系。 */
export const buildResourceGraph = (
  data: Workbench,
  category = "all"
): { nodes: ResourceNode[]; edges: Edge[] } => {
  const assets = activeAssets(data)
  const groups: {
    id: string
    name: string
    kind: ResourceNodeData["kind"]
    href: string
    resources: ResourceNodeData[]
  }[] = [
    {
      id: "mail",
      name: "邮箱",
      kind: "mail",
      href: "/mail",
      resources: data.accounts.map((account) => ({
        title: account.name,
        description: `${account.provider} · ${account.email}`,
        detail: `${data.mailSummary?.accounts.find((item) => item.id === account.id)?.unread ?? data.messages.filter((record) => record.accountId === account.id && !record.read).length} 封未读 · ${formatTime(account.lastSync)}`,
        status: account.status,
        kind: "mail",
        href: `/mail?account=${encodeURIComponent(account.id)}`,
      })),
    },
    {
      id: "storage",
      name: "资产",
      kind: "storage",
      href: "/assets",
      resources: data.connections.map((connection) => ({
        title: connection.name,
        description: `S3 · ${connection.bucket}`,
        detail: `${data.assetSummary?.storage.find((record) => record.id === connection.id)?.total ?? assets.filter((record) => record.connectionId === connection.id).length} 个文件 · ${formatTime(connection.lastSync)}`,
        status: connection.status,
        kind: "storage",
        href: `/assets?connection=${encodeURIComponent(connection.id)}`,
      })),
    },
    {
      id: "todo",
      name: "Todo",
      kind: "todo",
      href: "/todos",
      resources: data.todoLists.map((list) => ({
        title: list.name,
        description: "",
        detail: `${data.todos.filter((record) => record.listId === list.id && !record.done).length} 项待完成 · ${data.todos.filter((record) => record.listId === list.id && record.done).length} 项已完成`,
        kind: "todo",
        href: `/todos?list=${encodeURIComponent(list.id)}`,
      })),
    },
  ]
  const nodes: ResourceNode[] = []
  const edges: Edge[] = []
  const visibleGroups = groups.some((group) => group.id === category)
    ? groups.filter((group) => group.id === category)
    : groups
  let nextY = 0
  visibleGroups.forEach((group) => {
    const rowHeight = group.kind === "todo" ? 88 : 112
    const groupHeight = Math.max(1, group.resources.length) * rowHeight
    nodes.push({
      id: `group-${group.id}`,
      ariaLabel: group.name,
      className: "group/node",
      type: "resource",
      position: { x: 340, y: nextY + (groupHeight - 72) / 2 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        title: group.name,
        description: "",
        detail: `${group.resources.length} 个${group.kind === "todo" ? "清单" : "连接"}`,
        kind: group.kind,
        href: group.href,
      },
    })
    edges.push({
      id: `root-${group.id}`,
      source: "workspace",
      target: `group-${group.id}`,
      type: "smoothstep",
      animated: true,
    })
    group.resources.forEach((resource, index) => {
      const id = `resource-${group.id}-${resource.href}`
      nodes.push({
        id,
        ariaLabel: resource.title,
        className: "group/node",
        type: "resource",
        position: { x: 680, y: nextY + index * rowHeight },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: resource,
      })
      edges.push({
        id: `edge-${id}`,
        source: `group-${group.id}`,
        target: id,
        type: "smoothstep",
        animated: resource.status !== "paused" && resource.status !== "error",
      })
    })
    nextY += groupHeight + 40
  })
  nodes.unshift({
    id: "workspace",
    ariaLabel: "我的工作台",
    className: "group/node",
    type: "resource",
    position: { x: 0, y: (nextY - 40 - 72) / 2 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      title: "我的工作台",
      description: "",
      detail: `${data.accounts.length + data.connections.length} 个连接 · ${data.todoLists.length} 个清单`,
      kind: "workspace",
      href: "/dashboard",
    },
  })
  return { nodes, edges }
}
