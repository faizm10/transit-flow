import { Composition } from "remotion";
import { TransitFlowDemo, TOTAL_FRAMES } from "./TransitFlowDemo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="TransitFlowDemo"
      component={TransitFlowDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
