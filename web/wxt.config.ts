import { defineConfig } from "wxt";

// One MV3 source tree; WXT emits per-browser bundles (Chrome now; Firefox/Safari are
// the north-star targets — `wxt build -b firefox` etc.) and manages the background
// service-worker vs event-page split per browser. Version comes from package.json.
export default defineConfig({
  manifest: {
    name: "Rally Annotator",
    description:
      "Mark rally start/end + a point-ending reason to a CSV while watching web video " +
      "(HTML5 <video>, incl. youtube.com/watch). Net-separated racquet sports.",
    permissions: ["storage", "downloads"],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Toggle Rally Annotator panel" },
  },
});
