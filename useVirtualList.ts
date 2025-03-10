// 》》》使用的注意事项：
// 1、IndeterHeightVirtualListConfig.minimumLeftItems 不能和接口的分页size字段值一致。否则不会发起请求
// 2、IndeterHeightVirtualListConfig.size值需要实际渲染出来的高度大于容器视口，否则会因为不能滚动导致剩下的元素不能渲染出来
// 3、当使用到IndeterHeightVirtualListConfig.getList参数时，注意检查分页的页数处理。
// 4、IndeterHeightVirtualListConfig.itemHeight要和列表高度最小的子项Dom的一致，不然会出现滚动完后再往下滚动的现象。
// 5、列表子项的key一定要确保不会重复，不然就会出现子项数据跟渲染不一致的问题。或者直接不设置key
// 》》》问题排查：
// 2、要开启浏览器缓存，不然列表项有图片的话会闪烁。
// 3、滚动出现闪烁或者位置不一致的时候，注意检查列表子项的高度是否准确。（例如：内容可能有margin超出了子项的容器等，注意overflow:hidden包裹）

import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'

interface VirtualListConfig<T> {
  data: Ref<T[]> // 数据源
  scrollContainer: string // 滚动容器的元素选择器
  actualHeightContainer: string // 用于撑开高度的元素
  translateContainer: string // 用于偏移的元素选择器
  itemContainer: string // 列表项选择器
  itemHeight: number // 列表项高度，//元素高度和外边距
  size: number // 每次渲染数据量
  minimumLeftItems?: number //当列表剩余最少几条记录的时候触发数据加载，注意该值不能和接口请求的分页size字段值一致。否则不会发起请求
  maxItemHeight?: number //用于倒序列表判断是否要自动往上滚的 差值。 当 scrollContainer.offsetHeight + scrollContainer.scrollTop <= maxItemHeight 时，列表会自动往上滚动。此操作经常用于收到新消息上滚
}

type HtmlElType = HTMLElement | null

export default function useVirtualList<T>(config: VirtualListConfig<T>) {
  // 获取元素
  let actualHeightContainerEl: HtmlElType = null,
    translateContainerEl: HtmlElType = null,
    scrollContainerEl: HtmlElType = null

  // 数据源，便于后续直接访问
  let dataSource: any[] = []

  //记录当前滚动条的位置
  let curScrollTop: number = 0

  // 给业务组件监听的标志位，是否需要加载新数据
  const needLoadData = ref()

  config.maxItemHeight = config.maxItemHeight //176是房间消息列表的emojis元素的高度
  //定时器
  let timerHandler

  const minimumLeftItems: number = config.minimumLeftItems ? config.minimumLeftItems : 8

  //判断是否还有新的消息记录请求
  let needRequestDataOnceAgain = true
  

  // 更新实际高度
  const updateActualHeight = () => {
    let actualHeight = 0
    dataSource.forEach((_, i) => {
      actualHeight += getItemHeightFromCache(i)
    })

    actualHeightContainerEl!.style.height = actualHeight + 'px'
    return actualHeight
  }

  // 缓存已渲染元素的高度
  let RenderedItemsCache: any = {}

  // 更新已渲染列表项的缓存高度
  const updateRenderedItemCache = (index: number) => {
    // // 当所有元素的实际高度更新完毕，就不需要重新计算高度

    if (!(Object.keys(RenderedItemsCache).length < dataSource.length)) return

    //获取元素的高要用setTimeout，因为nextTick基本都在图片加载完成前就已经执行了，导致最终获取到的元素高度有误。
    //或者使用mutationObserver实时监控，此处为了省事降低资源占用。粗暴点
    if (timerHandler) clearTimeout(timerHandler)
    timerHandler = setTimeout(() => {
      // 获取所有列表项元素
      let Items: HTMLElement[] = Array.from((scrollContainerEl as HTMLDivElement).querySelectorAll(config.itemContainer))
      // 进行缓存
      Items.forEach((el) => {
        if (!RenderedItemsCache[index]) {
          RenderedItemsCache[index] = el.offsetHeight
        }
        index++
      })
      updateActualHeight()

      Items.length = 0
    }, 1000)
  }

  // 获取缓存高度，无缓存，取配置项的 itemHeight
  const getItemHeightFromCache = (index: number | string) => {
    const val = RenderedItemsCache[index]
    return val === void 0 ? config.itemHeight : val
  }

  // 实际渲染的数据
  const renderData: Ref<T[]> = ref([])

  // 更新实际渲染数据
  const updateRenderDataForward = (scrollTop: number) => {
    let startIndex = 0
    let offsetHeight = 0

    for (let i = 0; i < dataSource.length; i++) {
      offsetHeight += getItemHeightFromCache(i)

      if (offsetHeight >= scrollTop) {
        startIndex = i
        break
      }
    }
    //当剩余条数少于 minimumLeftItems,并且当前渲染的记录条数比最小剩余条数大
    //触发加载数据事件，至于实际情况要不要加载，由业务决定，这里只负责抛出加载事件
    if (needRequestDataOnceAgain && minimumLeftItems < dataSource.length && minimumLeftItems > dataSource.length - startIndex) {
      needRequestDataOnceAgain = false
      needLoadData.value = Date.now()
    }

    // 计算得出的渲染数据
    renderData.value = dataSource.slice(startIndex, startIndex + config.size)
    // 缓存最新的列表项高度
    updateRenderedItemCache(startIndex)

    // 更新偏移值
    updateOffset(offsetHeight - getItemHeightFromCache(startIndex))
  }

  // 更新偏移值
  const updateOffset = (offset: number) => {
    translateContainerEl!.style.transform = `translateY(${offset}px)`
  }

  // 滚动事件
  const handleScroll = ({ target }) => {
    updateRenderDataForward(target.scrollTop)
  }

  const resetVirtualList = () => {
    if (scrollContainerEl) scrollContainerEl.scrollTop = 0
    RenderedItemsCache = {}
    updateRenderedItemCache(0)
  }
  onMounted(() => {
    const { actualHeightContainer, scrollContainer, translateContainer } = config
    actualHeightContainerEl = typeof actualHeightContainer === 'string' ? document.querySelector(actualHeightContainer) : actualHeightContainer
    scrollContainerEl = typeof scrollContainer === 'string' ? document.querySelector(scrollContainer) : scrollContainer
    translateContainerEl = typeof translateContainer === 'string' ? document.querySelector(translateContainer) : translateContainer

    // 注册滚动事件
    scrollContainerEl?.addEventListener('scroll', handleScroll)
    // 数据源发生变动
    watch(
      () => config.data.value,
      (newVal) => {
        //如果最新的数据长度跟旧的列表长度一致，则判定没有新的消息记录请求了
        needRequestDataOnceAgain = true
        // 更新数据源
        dataSource = newVal
        if(newVal.length === 0) return
 
        updateRenderDataForward(curScrollTop)
      }
    )
    // window?.addEventListener('resize', resizeHandler)
  })

  // 移除滚动事件
  onBeforeUnmount(() => {
    scrollContainerEl?.removeEventListener('scroll', handleScroll)
    // window?.removeEventListener('resize', resizeHandler)
    actualHeightContainerEl = null
    scrollContainerEl = null
    translateContainerEl = null
  })
  return { renderData, needLoadData, resetVirtualList, updateActualHeight }
}
