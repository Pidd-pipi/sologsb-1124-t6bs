/**
 * 实寄封挂接邮路前的核对规则：
 * 1. 先核对邮路首末节点的局所与封上的寄出地 / 收件地是否一致，对不上即拒绝挂接；
 * 2. 起讫点一致时，再核对首末节点日期与封上寄出 / 到达日期，差异不阻止挂接，
 *    但要在详情页列出，并允许只把首末节点日期校准为封上日期（中间节点保持原样）。
 */
import type { Cover } from '@/types/cover'
import type { PostalRoute, RouteNode } from '@/types/route'
import { isValidDate } from '@/utils/dateRange'

/** 挂接端：起点（寄出）/ 终点（到达） */
export type LinkEndpoint = 'start' | 'end'

export interface EndpointConflict {
  endpoint: LinkEndpoint
  /** 封上的地点（寄出地 / 收件地），可能为空 */
  coverPlace: string
  /** 邮路对应节点的局所，可能为空 */
  nodePlace: string
}

export interface EndpointDateMismatch {
  endpoint: LinkEndpoint
  /** 封上日期（寄出 / 到达），可能待考 */
  coverDate: string
  /** 邮路首 / 末节点日期，可能待考 */
  nodeDate: string
}

export interface RouteLinkCheck {
  /** 邮路是否还有节点（无节点无法核对起讫点，按冲突处理） */
  hasNodes: boolean
  /** 起讫点全部对得上，才允许挂接 */
  endpointsMatched: boolean
  endpointConflicts: EndpointConflict[]
  /** 仅在起讫点一致时有意义：首末节点日期与封上日期的差异 */
  dateMismatches: EndpointDateMismatch[]
}

/** 去掉首尾空白后比较两个地点名。 */
export function samePlace(a: string, b: string): boolean {
  return (a || '').trim() === (b || '').trim()
}

/** 核对实寄封与邮路能否挂接。 */
export function checkRouteLink(cover: Cover, route: PostalRoute): RouteLinkCheck {
  const nodes: RouteNode[] = route.nodes ?? []
  if (nodes.length === 0) {
    return {
      hasNodes: false,
      endpointsMatched: false,
      endpointConflicts: [],
      dateMismatches: []
    }
  }

  const firstNode = nodes[0]
  const lastNode = nodes[nodes.length - 1]
  const endpointConflicts: EndpointConflict[] = []
  if (!samePlace(firstNode.office, cover.sentFrom)) {
    endpointConflicts.push({
      endpoint: 'start',
      coverPlace: cover.sentFrom,
      nodePlace: firstNode.office
    })
  }
  if (!samePlace(lastNode.office, cover.sentTo)) {
    endpointConflicts.push({
      endpoint: 'end',
      coverPlace: cover.sentTo,
      nodePlace: lastNode.office
    })
  }

  const endpointsMatched = endpointConflicts.length === 0
  const dateMismatches: EndpointDateMismatch[] = []
  if (endpointsMatched) {
    // 单节点邮路：首末是同一节点，起点 / 终点只在封上日期不同时分列两条差异。
    const sameNode = firstNode.key === lastNode.key
    const datePairs: Array<[LinkEndpoint, string, string]> = [
      ['start', cover.postDate, firstNode.arriveDate],
      ['end', cover.arriveDate, sameNode ? firstNode.arriveDate : lastNode.arriveDate]
    ]
    for (const [endpoint, coverDate, nodeDate] of datePairs) {
      // 两边都待考视为无差异；有一边能定日且互不一致才提示。
      const coverKnown = isValidDate(coverDate)
      const nodeKnown = isValidDate(nodeDate)
      if ((coverKnown || nodeKnown) && coverDate !== nodeDate) {
        dateMismatches.push({ endpoint, coverDate, nodeDate })
      }
    }
  }

  return { hasNodes: true, endpointsMatched, endpointConflicts, dateMismatches }
}

/** 挂接端的中文称谓，供提示文案复用。 */
export function endpointLabel(endpoint: LinkEndpoint): string {
  return endpoint === 'start' ? '起点' : '终点'
}

/** 挂接端对应封上地点的中文称谓。 */
export function endpointPlaceLabel(endpoint: LinkEndpoint): string {
  return endpoint === 'start' ? '寄出地' : '收件地'
}

/** 拒绝挂接的完整提示（起讫点对不上时使用）。 */
export function linkConflictMessage(check: RouteLinkCheck): string {
  if (!check.hasNodes) return '该邮路尚无节点，无法核对起讫点，请先在邮路编辑器补录节点。'
  if (check.endpointsMatched) return ''
  const sides = check.endpointConflicts.map((c) => endpointLabel(c.endpoint)).join('、')
  const details = check.endpointConflicts
    .map((c) => {
      const coverPlace = c.coverPlace.trim() || '（待考）'
      const nodePlace = c.nodePlace.trim() || '（待补）'
      return `${endpointLabel(c.endpoint)}：封上${endpointPlaceLabel(c.endpoint)}为「${coverPlace}」，邮路节点为「${nodePlace}」`
    })
    .join('；')
  return `起讫点冲突（${sides}），已拒绝挂接：${details}。`
}

/** 单条首末日期差异的中文描述。 */
export function dateMismatchText(item: EndpointDateMismatch): string {
  const coverDate = isValidDate(item.coverDate) ? item.coverDate : '待考'
  const nodeDate = isValidDate(item.nodeDate) ? item.nodeDate : '待考'
  return `${endpointLabel(item.endpoint)}：封上${
    item.endpoint === 'start' ? '寄出' : '到达'
  }日期 ${coverDate}，邮路首末节点日期 ${nodeDate}`
}

/**
 * 生成「只把首末节点日期校准为封上日期」后的节点数组：
 * 中间中转节点（含其日期与中转戳）保持原样；封上日期待考的一端不改写。
 */
export function alignEndpointDates(nodes: RouteNode[], cover: Cover): RouteNode[] {
  if (nodes.length === 0) return nodes
  const next = nodes.map((n) => ({ ...n }))
  const firstIndex = 0
  const lastIndex = next.length - 1
  if (isValidDate(cover.postDate)) {
    next[firstIndex].arriveDate = cover.postDate
  }
  if (isValidDate(cover.arriveDate)) {
    if (lastIndex === firstIndex) {
      // 单节点邮路：到达日期优先于寄出日期，避免同节点两个日期互相覆盖。
      next[firstIndex].arriveDate = cover.arriveDate
    } else {
      next[lastIndex].arriveDate = cover.arriveDate
    }
  }
  return next
}
