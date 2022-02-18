This is a platform server that provides web-based MR collaboration.

Look https://www.wxr.onl/ for detail.


# WXR Mode Interface
> Control WXR mode especially 360 Mode

ar-mode-control 컴포넌트에서 현장 작업자가 AR mode에서 360 영상 스트리밍을 시작, 끝내는 버튼을 추가했습니다.
태블릿에서 AR mode로 들어가도 카메라 화면이 보이지 않는 문제는 문제가 발생하는 코드를 주석처리해두었습니다.

sync 컴포넌트에서는 A-frame에서 360 영상을 재생하는 엔티티를 컨트롤하여 원격 전문가가 360 Mode 전환을 쉽게 할 수 있도록 하였습니다.