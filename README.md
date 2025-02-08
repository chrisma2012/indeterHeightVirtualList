# indeterHeightVirtualList
基于vue3的不定高虚拟列表

### 思路  
用一映射对象listItemHeightMap存储每个列表元素的dom高度，在开始渲染前便为每个图片元素创建对应的img元素,在load事件记录每个图片元素的高度，同时更新总列表的高度。 
```javascript
  //计算图片高度
  const caculateImgHeight = (imgSrc: string, index: number, listItemHeightMap) => {
    if (imgMapHeight.get(imgSrc)) return //imgMapHeight为图片链接和高度的映射
    let imgDom: HTMLImageElement | null = document.createElement('img')
    imgDom.src = imgSrc
    imgDom.onload = () => {
      imgMapHeight.set(imgSrc, imgDom!.offsetHeight)
      listItemHeightMap[index] =  imgDom!.offsetHeight //更新映射中图片元素高度
      imgDom = null
    }
  }
```
事实上，更好的方式是，图片元素设置一个固定的高度，然后点击图片放大查看，便能解决图片尺寸小不能查看的问题。  

