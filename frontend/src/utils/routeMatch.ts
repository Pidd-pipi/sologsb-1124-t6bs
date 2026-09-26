/**
 * 实寄封 ↔ 邮路挂接校验：
 * 1. 起讫点核对——封的寄出地 / 收件地必须分别与邮路首、末节点的局所一致，否则拒绝挂接；
 * 2. 首末日期差异——起讫点一致但首末节点日期与封上日期对不上时允许挂接，
 *    差异在详情页列出，并可一键只把邮路首末节点日期校准为封上日期（中间中转节点不动）。
 */
import type { Cover } from '@/types/cover'
import type { PostalRoute, RouteNode } from '@/types/route'
import { isValidDate } from '@/utils/dateRange'

/** 起讫点冲突：指出是起点还是终点对不上，并给出双方取值 */
export interface EndpointConflict {
  side: 'start' | 'end'
  routeOffice: string
  coverOffice: string
}

/** 首末节点日期与封上日期的一处差异 */
export interface EndpointDateDiff {
  side: 'start' | 'end'
  office: string
  routeDate: string
  coverDate: string
}

function normalizeOffice(office: string): string {
  return (office || '').trim()
}

/** 邮路首节点（无节点时为 null） */
export function firstNodeOf(route: PostalRoute): RouteNode | null {
  return route.nodes[0] ?? null
}

/** 邮路末节点（无节点时为 null；单节点邮路首末同点） */
export function lastNodeOf(route: PostalRoute): RouteNode | null {
  return route.nodes[route.nodes.length - 1] ?? null
}

/**
 * 挂接前核对起讫点：封的寄出地 ↔ 邮路首节点、收件地 ↔ 邮路末节点。
 * 返回 null 表示起讫点一致；否则返回冲突详情（起点或终点）。
 */
export function checkEndpoints(cover: Cover, route: PostalRoute): EndpointConflict | null {
  const first = firstNodeOf(route)
  if (!first || normalizeOffice(first.office) !== normalizeOffice(cover.sentFrom)) {
    return { side: 'start', routeOffice: first?.office ?? '', coverOffice: cover.sentFrom }
  }
  const last = lastNodeOf(route)
  if (!last || normalizeOffice(last.office) !== normalizeOffice(cover.sentTo)) {
    return { side: 'end', routeOffice: last?.office ?? '', coverOffice: cover.sentTo }
  }
  return null
}

/** 起讫点冲突的中文提示，供挂接入口拒绝时展示 */
export function endpointConflictMessage(conflict: EndpointConflict): string {
  const side = conflict.side === 'start' ? '起点' : '终点'
  const routeOffice = conflict.routeOffice || '（未设置）'
  const coverOffice = conflict.coverOffice || '（未填写）'
  return `${side}冲突：邮路${side}为「${routeOffice}」，封上为「${coverOffice}」，已拒绝挂接`
}

/**
 * 首末节点日期与封上日期的差异列表。
 * 仅当封上日期有效时参与比对；节点日期缺失或与封上日期不同都算差异。
 */
export function endpointDateDiffs(cover: Cover, route: PostalRoute): EndpointDateDiff[] {
  const diffs: EndpointDateDiff[] = []
  const first = firstNodeOf(route)
  if (first && isValidDate(cover.postDate) && first.arriveDate !== cover.postDate) {
    diffs.push({ side: 'start', office: first.office, routeDate: first.arriveDate, coverDate: cover.postDate })
  }
  const last = lastNodeOf(route)
  if (last && route.nodes.length > 1 && isValidDate(cover.arriveDate) && last.arriveDate !== cover.arriveDate) {
    diffs.push({ side: 'end', office: last.office, routeDate: last.arriveDate, coverDate: cover.arriveDate })
  }
  return diffs
}

/**
 * 生成校准后的节点数组：只把首、末节点的到达日期改为封上寄出 / 到达日期，
 * 中间中转节点保持原样；封上日期无效的一端不动。
 */
export function calibrateEndpointDates(cover: Cover, route: PostalRoute): RouteNode[] {
  return route.nodes.map((node, index) => {
    if (index === 0 && isValidDate(cover.postDate)) {
      return { ...node, arriveDate: cover.postDate }
    }
    if (index === route.nodes.length - 1 && route.nodes.length > 1 && isValidDate(cover.arriveDate)) {
      return { ...node, arriveDate: cover.arriveDate }
    }
    return { ...node }
  })
}
