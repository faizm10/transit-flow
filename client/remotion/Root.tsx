import { Composition } from "remotion";
import { TransitFlowDemo } from "./TransitFlowDemo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="TransitFlowDemo"
      component={TransitFlowDemo}
      durationInFrames={1200} // 40s @ 30fps
      fps={30}
      width={1280}
      height={720}
    />
  );
};
