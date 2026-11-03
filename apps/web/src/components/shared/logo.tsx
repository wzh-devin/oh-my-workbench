import { Link } from "react-router"

import { Item } from "@/components/ui/item"

/** 侧栏、手机顶栏和 favicon 共用同一标识，首页链接直达 Dashboard。 */
export function Logo() {
  return (
    <Item
      render={<Link to="/dashboard" aria-label="工作台首页" />}
      className="flex size-7 shrink-0 items-center justify-center p-0"
    >
      <img
        src="/logo.svg?v=3"
        width="28"
        height="28"
        alt=""
        className="size-full dark:invert"
      />
    </Item>
  )
}
