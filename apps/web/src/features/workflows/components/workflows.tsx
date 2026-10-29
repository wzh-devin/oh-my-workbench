import { TodoState } from "@/features/todos/components/todo-state"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { useReducedMotion } from "motion/react"
import {
  Handle,
  Panel,
  Position,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type NodeProps,
  type XYPosition,
} from "@xyflow/react"
import {
  FilesIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  MailIcon,
  MaximizeIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
} from "lucide-react"
import { FlowCanvas, FIT_VIEW_OPTIONS } from "@/components/shared/flow-canvas"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  StatusBadge,
  WorkbenchNavigation,
  WorkbenchScreen,
} from "@/features/workbench/components"
import {
  buildResourceGraph,
  type ResourceNode,
} from "@/features/workbench/resource-graph"
import { useWorkbench } from "@/features/workbench/store"

const ICONS = {
  workspace: LayoutDashboardIcon,
  mail: MailIcon,
  storage: FilesIcon,
  todo: ListTodoIcon,
}

function ResourceCard({
  data,
  sourcePosition,
  targetPosition,
}: NodeProps<ResourceNode>) {
  const Icon = ICONS[data.kind]
  return (
    <>
      <Handle
        type="target"
        position={targetPosition ?? Position.Left}
        isConnectable={false}
      />
      <Card
        size="sm"
        className="w-64 cursor-grab group-focus-visible/node:outline-2 group-focus-visible/node:outline-ring active:cursor-grabbing"
      >
        <CardHeader>
          <div className="flex items-start gap-2">
            <Icon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <CardTitle>
                <Link
                  to={data.href}
                  draggable={false}
                  className="nodrag nopan block truncate hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {data.title}
                </Link>
              </CardTitle>
              {data.description && (
                <CardDescription className="truncate">
                  {data.description}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          {data.status && <StatusBadge status={data.status} />}
          <span className="text-xs text-muted-foreground tabular-nums">
            {data.detail}
          </span>
        </CardContent>
      </Card>
      <Handle
        type="source"
        position={sourcePosition ?? Position.Right}
        isConnectable={false}
      />
    </>
  )
}
const NODE_TYPES = { resource: ResourceCard }

/** 节点位置由 React Flow 管理；来源状态更新时保留当前拖动位置。 */
function ResourceCanvas({
  graph,
}: {
  graph: ReturnType<typeof buildResourceGraph>
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const positions = useRef<Record<string, XYPosition>>({})
  const [flowPaused, setFlowPaused] = useState(false)
  const reduceMotion = useReducedMotion()
  const edges = useMemo(
    () =>
      graph.edges.map((edge) =>
        reduceMotion || flowPaused ? { ...edge, animated: false } : edge
      ),
    [graph.edges, reduceMotion, flowPaused]
  )
  useEffect(() => {
    setNodes((current) => {
      const existing = new Map(current.map((node) => [node.id, node]))
      return graph.nodes.map((node) => ({
        ...existing.get(node.id),
        ...node,
        position: positions.current[node.id] ?? node.position,
      }))
    })
  }, [graph.nodes, setNodes])
  return (
    <FlowCanvas<ResourceNode, (typeof graph.edges)[number]>
      showMiniMap={false}
      nodes={nodes}
      edges={edges}
      onNodesChange={(changes) => {
        for (const change of changes) {
          if (change.type === "position" && change.position)
            positions.current[change.id] = change.position
        }
        onNodesChange(changes)
      }}
      nodeTypes={NODE_TYPES}
      nodesDraggable
      nodesConnectable={false}
      edgesFocusable={false}
      deleteKeyCode={null}
      ariaLabelConfig={{
        "controls.zoomIn.ariaLabel": "放大",
        "controls.zoomOut.ariaLabel": "缩小",
        "controls.fitView.ariaLabel": "适应画布",
      }}
    >
      <OverviewControls
        graphKey={graph.nodes.map((node) => node.id).join("|")}
        flowPaused={flowPaused}
        flowDisabled={!!reduceMotion}
        onToggleFlow={() => setFlowPaused((paused) => !paused)}
      />
    </FlowCanvas>
  )
}

/** 只有节点集合变化时重新适配视图，普通状态变化保留用户的缩放与位置。 */
function OverviewControls({
  graphKey,
  flowPaused,
  flowDisabled,
  onToggleFlow,
}: {
  graphKey: string
  flowPaused: boolean
  flowDisabled: boolean
  onToggleFlow: () => void
}) {
  const initialized = useNodesInitialized()
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  useEffect(() => {
    if (!initialized) return
    const frame = window.requestAnimationFrame(() => {
      void fitView(FIT_VIEW_OPTIONS)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [fitView, graphKey, initialized])
  return (
    <Panel position="bottom-left">
      <Card size="sm">
        <CardContent className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="缩小总览"
            onClick={() => {
              void zoomOut()
            }}
          >
            <MinusIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="放大总览"
            onClick={() => {
              void zoomIn()
            }}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="适应画布"
            onClick={() => {
              void fitView(FIT_VIEW_OPTIONS)
            }}
          >
            <MaximizeIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={flowPaused ? "播放连线动画" : "暂停连线动画"}
            aria-pressed={flowPaused}
            disabled={flowDisabled}
            onClick={onToggleFlow}
          >
            {flowPaused ? (
              <PlayIcon aria-hidden="true" />
            ) : (
              <PauseIcon aria-hidden="true" />
            )}
          </Button>
        </CardContent>
      </Card>
    </Panel>
  )
}

/** 原 Workflow 页面现在展示自动派生的资源关系，不维护独立的图记录。 */
export function Workflows() {
  const { data } = useWorkbench()
  const [params, setParams] = useSearchParams()
  const category = params.get("category") ?? "all"
  const graph = useMemo(
    () => buildResourceGraph(data, category),
    [category, data]
  )
  return (
    <>
      <WorkbenchNavigation
        title="资源分类"
        sections={[
          {
            id: "overview",
            title: "总览",
            items: [
              {
                id: "all",
                label: "全部资源",
                icon: <LayoutDashboardIcon aria-hidden="true" />,
              },
            ],
          },
          {
            id: "categories",
            title: "分类",
            items: [
              {
                id: "mail",
                label: "邮箱",
                icon: <MailIcon aria-hidden="true" />,
                badge: data.accounts.length,
              },
              {
                id: "storage",
                label: "资产",
                icon: <FilesIcon aria-hidden="true" />,
                badge: data.connections.length,
              },
              {
                id: "todo",
                label: "Todo",
                icon: <ListTodoIcon aria-hidden="true" />,
                badge: data.todoLists.length,
              },
            ],
          },
        ]}
        activeItem={
          ["mail", "storage", "todo"].includes(category) ? category : "all"
        }
        onItemChange={(id) => setParams(id === "all" ? {} : { category: id })}
      />
      <WorkbenchScreen
        title="Workflow 总览"
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/dashboard" />}
          >
            <LayoutDashboardIcon aria-hidden="true" />
            Dashboard
          </Button>
        }
      >
        <TodoState>
          <div className="-m-4 flex min-h-0 min-w-0 flex-1">
            <ReactFlowProvider>
              <ResourceCanvas key={category} graph={graph} />
            </ReactFlowProvider>
          </div>
        </TodoState>
      </WorkbenchScreen>
    </>
  )
}
