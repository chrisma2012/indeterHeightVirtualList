// 》》》使用的注意事项：
// 1、IndeterHeightVirtualListConfig.minimumLeftItems 不能和接口的分页size字段值一致。否则不会发起请求
// 2、IndeterHeightVirtualListConfig.size值需要实际渲染出来的高度大于容器视口，否则会因为不能滚动导致剩下的元素不能渲染出来
// 3、当使用到IndeterHeightVirtualListConfig.getList参数时，注意检查分页的页数处理。
// 4、IndeterHeightVirtualListConfig.itemHeight要和列表高度最小的子项Dom的一致，不然会出现滚动完后再往下滚动的现象。
// 5、列表子项的key一定要确保不会重复，不然就会出现子项数据跟渲染不一致的问题。或者直接不设置key
// 》》》问题排查：
// 2、要开启浏览器缓存，不然列表项有图片的话会闪烁。
// 3、滚动出现闪烁或者位置不一致的时候，注意检查列表子项的高度是否准确。（例如：内容可能有margin超出了子项的容器等，注意overflow:hidden包裹）

import { debounce } from '@/utils'
import { DomScroll } from '@/utils/dom-scroll'
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import useIsManualScroll from './useIsManualScroll'

interface IndeterHeightVirtualListConfig<T> {
  dataChangeFlag: Ref<number> //判断是否有有新数据渲染的标志位
  scrollContainer: string // 滚动容器的元素选择器
  actualHeightContainer: string // 用于撑开高度的元素
  translateContainer: string // 用于偏移的元素选择器
  itemContainer: string // 列表项选择器
  itemHeight: number // 列表项高度，//元素高度和外边距
  // imageItemHeight: number // TODO图片元素中图片的固定高度，默认给图片设定高度，用户可通过点击放大查看
  size: number // 每次渲染数据量
  minimumLeftItems?: number //当列表剩余最少几条记录的时候触发数据加载，注意该值不能和接口请求的分页size字段值一致。否则不会发起请求
}

type HtmlElType = HTMLElement | null

export default function useIndeterHeightVirtualList<T>(config: IndeterHeightVirtualListConfig<T>) {
  // 获取元素
  let actualHeightContainerEl: HtmlElType = null,
    translateContainerEl: HtmlElType = null,
    scrollContainerEl: HtmlElType = null

  // 数据源，便于后续直接访问
  let dataSource: T[] = []

  //记录当前滚动条的位置
  let curScrollTop: number = 0

  // 给业务组件监听的标志位，是否需要加载新数据
  const needLoadData = ref()
  // 给业务组件监听的标志位，底部是否有新的消息可查看
  const hasNewMessage = ref(false)
  //滚动对象
  let ScrollDom: DomScroll
  //上一次滚动的距离
  let lastScrollDistance = 0
  //区分是否手动干预过的状态
  // let isManualStatus = false
  //当前内容区的实际高度
  let curActualHeight = 0
  //是否是滚动到底部
  let isScrollToBottom = false
  let curStartIndex = 0
  //定时器
  let timerHandler
  let resizeObserverInstance: ResizeObserver | null
  let scrollToBottomTimeoutHandler

  const minimumLeftItems: number = config.minimumLeftItems ? config.minimumLeftItems : 8

  //判断是否还有新的消息记录请求
  let needRequestDataOnceAgain = true

  const isListBottom = () => {
    return (
      scrollContainerEl?.offsetHeight! + scrollContainerEl?.scrollTop! === actualHeightContainerEl?.offsetHeight! ||
      actualHeightContainerEl?.offsetHeight! < scrollContainerEl?.offsetHeight!
    )
  }

  //判断是否用户手动的滚动
  const { isManualScrollStatus } = useIsManualScroll(config.scrollContainer, isListBottom)

  // 更新实际高度
  const updateActualHeight = (actualHeight: number) => {
    actualHeightContainerEl!.style.height = actualHeight + 'px'
  }

  // 获取缓存高度，无缓存，取配置项的 itemHeight
  const getItemHeightFromMap = (index: number | string) => {
    return listItemHeightMap[index] ?? config.itemHeight //?? 因为有的dom高度为0
  }

  // 缓存已渲染元素的高度
  let listItemHeightMap: any = {}

  // 更新已渲染列表项的缓存高度
  const updateItemHeightMapByRenderDom = (index: number) => {
    // // 当所有元素的实际高度更新完毕，就不需要重新计算高度
    if (!(Object.keys(listItemHeightMap).length < dataSource.length) && !isScrollToBottom) {
      return
    }

    //获取元素的高要用setTimeout，因为nextTick基本都在图片加载完成前就已经执行了，导致最终获取到的元素高度有误。
    if (timerHandler) {
      clearTimeout(timerHandler)
    }
    timerHandler = setTimeout(() => {
      if (!translateContainerEl?.children) return
      // 获取所有列表项元素
      let Items: HTMLElement[] = Array.from(translateContainerEl?.children!) as HTMLElement[]
      const lastItemIndex = Items.length + index - 1
      // //倒序遍历，因为新增的元素都在末尾
      for (let i = lastItemIndex; i >= index; i--) {
        if (listItemHeightMap[i]) break //如果当前元素已经记录在案，中断循环
        listItemHeightMap[i] = Items[i - index].offsetHeight
        curActualHeight += Items[i - index].offsetHeight
      }

      // 更新实际高度
      updateActualHeight(curActualHeight)
      const distance = actualHeightContainerEl?.offsetHeight! - scrollContainerEl?.offsetHeight!
      //倘若消息列表的高度小于容器高度
      if (distance < 0) {
        isScrollToBottom = false
      }
      //如果带滚动的列表条数大于30条，则默认每次的pagesize为200。
      //倒序渲染。视口处于列表的底部，则收到新消息时，自动往上滚动
      // 单条多条消息的接收滚动使用这个
      if (!isScrollToBottom && !isManualScrollStatus.value && distance > 0) {
        lastScrollDistance = ScrollDom.getScrollStatus()
          ? distance - lastScrollDistance
          : distance - scrollContainerEl?.scrollTop!
        ScrollDom.scroll(lastScrollDistance)
      }

      //一次性滚动到底使用这个
      if (isScrollToBottom) {
        //滚动距离直接取actualHeightContainerEl?.offsetHeight。因为是实时更新的，不用计算
        nextTick(() => {
          ScrollDom.scrollByConstantSpeed(actualHeightContainerEl?.offsetHeight!)
          if (curStartIndex + renderData.value.length === dataSource.length && isListBottom()) {
            isScrollToBottom = false //滚动到底部之后，将滚动到底的状态置为false
            isManualScrollStatus.value = false //置底为非人工干预状态
          }
        })
      }

      Items.length = 0
    }, 10)
  }

  // 实际渲染的数据
  const renderData: Ref<readonly T[]> = ref([])
  // 更新实际渲染数据
  const getRealRenderListData = (scrollTop: number, pageSize: number = 200) => {
    let startIndex = 0
    let offsetHeight = 0
    //一次性滚动到底部的时候，取size=200。因为size值偏小，
    //滚动会出现卡顿的视觉效果。其他时候去默认的config.size值
    const size = isScrollToBottom ? pageSize : config.size
    for (let i = 0; i < dataSource.length; i++) {
      offsetHeight += getItemHeightFromMap(i)
      if (offsetHeight >= scrollTop) {
        startIndex = i
        curStartIndex = i //供全局用
        break
      }
    }
    //当剩余条数少于 minimumLeftItems,并且当前渲染的记录条数比最小剩余条数大
    //触发加载数据事件，至于实际情况要不要加载，由业务决定，这里只负责抛出加载事件
    if (
      needRequestDataOnceAgain &&
      minimumLeftItems < dataSource.length &&
      minimumLeftItems > dataSource.length - startIndex
    ) {
      needRequestDataOnceAgain = false
      needLoadData.value = Date.now()
    }

    // 计算得出的渲染数据
    renderData.value = Object.freeze(dataSource.slice(startIndex, startIndex + size))

    // 缓存最新的列表项高度
    updateItemHeightMapByRenderDom(startIndex)

    // 更新偏移值
    updateOffset(offsetHeight - getItemHeightFromMap(startIndex))
    curScrollTop = scrollTop
  }

  // 更新偏移值
  const updateOffset = (offset: number) => {
    translateContainerEl!.style.transform = `translateY(${offset}px)`
  }

  //点击回到底部按钮
  const scrollToBottomByButton = () => {
    isScrollToBottom = true
    getRealRenderListData(curScrollTop)
  }
  //js调用 回到底部
  const scrollToBottom = () => {
    if (isManualScrollStatus.value || isListBottom()) return
    isScrollToBottom = true
    getRealRenderListData(curScrollTop)
  }

  // 滚动事件
  const handleScroll = ({ target }) => {
    //手动滚到底部，也视作为 非手动干预状态
    ScrollDom.setScrollPermission(isListBottom()) //中止新消息导致的列表滚动
    // 一次性滚动到底
    getRealRenderListData(target.scrollTop)
    //滚动到底部的时候将《有新消息》置false
    if (
      actualHeightContainerEl?.offsetHeight! - (scrollContainerEl?.offsetHeight! + target.scrollTop) <=
      config.itemHeight
    ) {
      hasNewMessage.value = false
    }
  }

  const resetIndeterHeightVirtualList = () => {
    if (!scrollContainerEl || !actualHeightContainerEl) return
    scrollContainerEl.scrollTop = 0
    listItemHeightMap = {}
    updateItemHeightMapByRenderDom(0)
    actualHeightContainerEl.style.display = 'none' // 解决列表数据为空再置为有值时导致的视觉抖动

    curScrollTop = 0
    curStartIndex = 0
    curActualHeight = 0
    lastScrollDistance = 0
    updateActualHeight(scrollContainerEl?.offsetHeight!)
    actualHeightContainerEl!.style.display = 'block'
  }

  const setVirtualListData = (list) => {
    dataSource = Object.freeze(list)
  }

  //监听窗口尺寸变化
  const addDomResizeListener = (targetDom) => {
    let isFirstTime = true
    let lastDomHeight = translateContainerEl!.offsetHeight
    resizeObserverInstance = new ResizeObserver(
      debounce(function () {
        if (isFirstTime) return (isFirstTime = false)
        //只需要监听translateContainerEl元素的高度变化即可，因为actualHeightContainerEl，scrollContainer的高度是写死的
        if (lastDomHeight === translateContainerEl!.offsetHeight) return
        lastDomHeight = translateContainerEl!.offsetHeight
        resetIndeterHeightVirtualList()
        scrollToBottomByButton()
      }, 600)
    )
    resizeObserverInstance.observe(targetDom, { box: 'border-box' })
  }
  const removeDomResizeListener = () => {
    resizeObserverInstance!.disconnect()
    resizeObserverInstance = null
  }

  onMounted(() => {
    const { actualHeightContainer, scrollContainer, translateContainer } = config
    actualHeightContainerEl =
      typeof actualHeightContainer === 'string' ? document.querySelector(actualHeightContainer) : actualHeightContainer
    scrollContainerEl = typeof scrollContainer === 'string' ? document.querySelector(scrollContainer) : scrollContainer
    translateContainerEl =
      typeof translateContainer === 'string' ? document.querySelector(translateContainer) : translateContainer
    ScrollDom = new DomScroll(scrollContainerEl)

    // 注册滚动事件
    scrollContainerEl?.addEventListener('scroll', handleScroll)
    addDomResizeListener(scrollContainerEl)

    let firstMsgNum = 0
    // 数据源发生变动
    watch(
      () => config.dataChangeFlag.value,
      () => {
        if (firstMsgNum === 0) firstMsgNum = dataSource.length
        //如果最新的数据长度跟旧的列表长度一致，则判定没有新的消息记录请求了
        needRequestDataOnceAgain = true
        //倒序、非第一次赋值、出现滚动条了
        //dataSource.length > 3 dataSource默认会有3条。此处与业务耦合了，要改成通用的，此处需去掉
        if (dataSource.length > 3 && scrollContainerEl?.offsetHeight! < actualHeightContainerEl?.offsetHeight!) {
          //倘若视口不在列表的底部，则不执行更新操作
          if (
            scrollContainerEl?.offsetHeight! + scrollContainerEl?.scrollTop! <
            actualHeightContainerEl?.offsetHeight!
          ) {
            if (isManualScrollStatus.value) {
              //手动干预的状态才显示《新消息》
              hasNewMessage.value = true
            }

            return
          }

          //倒序渲染，非第一次赋值后，后续均用updateRenderDataForward
          return getRealRenderListData(curScrollTop)
        }
        scrollToBottomByButton()
      },
      {
        immediate: true
      }
    )
  })

  // 移除滚动事件
  onBeforeUnmount(() => {
    scrollContainerEl?.removeEventListener('scroll', handleScroll)
    removeDomResizeListener()
    actualHeightContainerEl = null
    scrollContainerEl = null
    translateContainerEl = null
  })
  return {
    renderData,
    setVirtualListData,
    needLoadData,
    hasNewMessage,
    resetIndeterHeightVirtualList,
    updateActualHeight,
    scrollToBottom,
    scrollToBottomByButton
  }
}
