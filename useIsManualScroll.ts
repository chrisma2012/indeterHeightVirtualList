/**
 * 判断当前列表是否由人手动滚动（即不是js滚动）
 *
 * @export
 * @param {(Element | string)} targetDom 列表容器
 * @param {Function} isListBottom 判断当前列表是否滚动到底部
 * @return {*}
 */
export default function useIsManualScroll(targetDom: Element | string, isListBottom: Function) {
  const isManualScrollStatus = ref(false)
  let isMouseDown = false

  const scrollAction = () => {
    if (isMouseDown) {
      isManualScrollStatus.value = !isListBottom()
    }
  }
  const mouseupAction = () => {
    isMouseDown = false
  }

  const mousedownAction = () => {
    isMouseDown = true
  }
  const wheelAction = () => {
    isManualScrollStatus.value = !isListBottom()
  }
  onMounted(() => {
    targetDom = typeof targetDom === 'string' ? document.querySelector(targetDom)! : targetDom
    targetDom?.addEventListener('scroll', scrollAction)
    targetDom?.addEventListener('mouseup', mouseupAction)
    targetDom?.addEventListener('mousedown', mousedownAction)
    targetDom?.addEventListener('wheel', wheelAction)
  })

  onBeforeUnmount(() => {
    ;(targetDom as Element)?.removeEventListener('scroll', scrollAction)
    ;(targetDom as Element)?.removeEventListener('mouseup', mouseupAction)
    ;(targetDom as Element)?.removeEventListener('mousedown', mousedownAction)
    ;(targetDom as Element)?.removeEventListener('wheel', wheelAction)
  })

  return { isManualScrollStatus }
}
