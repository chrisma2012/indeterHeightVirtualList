export class DommScroll {
  private weakMap = new WeakMap()
  // static hasNewScrollIssues = false
  public isScrolling = false //滚动状态
  private remainDistance = 0 //变速滚动剩余距离
  private remainDistanceConstant = 0 //恒速滚动剩余距离
  private canScroll = true
  private keepSpeed = false
  private toScrollByFrame = 0 //每帧滚动的距离

  constructor(targetDom) {
    this.weakMap.set(this, targetDom)
  }
  public scroll(distance) {
    this.setScrollPermission(true)
    const targetDom = this.weakMap.get(this)
    let hasScrollDis = targetDom.scrollTop
    this.remainDistance += distance
    if (this.isScrolling) {
      this.keepSpeed = true // 上一次滚动还没有结束，又来了新的滚动事务，为了保持滚动的流畅顺滑一致性，只能以上一次的滚动速度保持滚动。
      return
    }

    let time = 0
    this.isScrolling = true
    const scrollLoop = function () {
      if (!this.canScroll) {
        this.isScrolling = false
        return
      }
      time++
      const rate = 1 / Math.pow(20, 0.016 * time) / 5
      if (!this.keepSpeed) {
        //当前只有一次滚动事务
        this.toScrollByFrame = this.remainDistance * rate //每帧需要滚动的距离
        if (this.toScrollByFrame < 5) this.toScrollByFrame = 5 //要滚动的距离小于5时，按照距离5滚动
      }

      hasScrollDis += this.toScrollByFrame
      targetDom.scrollTop = hasScrollDis
      this.remainDistance -= this.toScrollByFrame //剩余距离
      if (this.remainDistance < 4) {
        //如果剩余距离小于4，直接滚完
        targetDom.scrollTop = hasScrollDis + this.remainDistance
        this.remainDistance = 0 //重置为0
        this.isScrolling = false
        this.keepSpeed = false
        return
      }
      requestAnimationFrame(scrollLoop)
    }.bind(this)

    scrollLoop()
  }

  public scrollByConstantSpeed(distance: number) {
    this.setScrollPermission(true)
    const targetDom = this.weakMap.get(this)
    let hasScrollDis = targetDom.scrollTop

    //业务多次调用该方法，将传入的滚动距离累计起来滚动。不能分多个任务滚
    if (this.isScrolling) {
      this.remainDistanceConstant += distance
      // console.warn('上次没滚完，接着滚')
      return 
    }
    this.remainDistanceConstant = distance
    let time = 0
    this.isScrolling = true
    // const startPos = targetDom.scrollTop;
    const scrollLoopConstant = function () {
 
      time++

      //当前只有一次滚动事务
      this.toScrollByFrame = this.remainDistanceConstant * 0.2 //每帧需要滚动的距离
      if (this.toScrollByFrame < 5) this.toScrollByFrame = 5 //要滚动的距离小于5时，按照距离5滚动

      // console.log(this.toScrollByFrame)
      hasScrollDis += this.toScrollByFrame
      targetDom.scrollTop = hasScrollDis

      this.remainDistanceConstant -= this.toScrollByFrame //剩余距离
      // console.warn(targetDom.scrollTop)
      if (this.remainDistanceConstant < 4) {
        //如果剩余距离小于4，直接滚完
        targetDom.scrollTop = hasScrollDis + this.remainDistanceConstant
        this.remainDistanceConstant = 0 //重置为0
        this.isScrolling = false
        this.keepSpeed = false
        // console.log('滚动结束')
        return
      }
      // if (DomScroll.hasNewScrollIssues) return
      requestAnimationFrame(scrollLoopConstant)
    }.bind(this)

    scrollLoopConstant()
  }

  public getScrollStatus() {
    return this.isScrolling
  }

  public setScrollPermission(flag: boolean) {
    this.canScroll = flag
  }
}
