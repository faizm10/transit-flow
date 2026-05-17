import { Config } from "@remotion/cli/config";

// Tell Remotion where to find static assets (videos, images, etc.)
// staticFile("clip1.mov") will resolve to remotion/assets/clip1.mov
Config.setPublicDir("./remotion/assets");
