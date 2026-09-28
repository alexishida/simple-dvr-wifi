import { useRef, useState } from "react";
import type { CameraSummary } from "../../shared/contracts.js";
import { CameraIcon, FolderIcon } from "../icons.js";
import { LibraryView } from "./LibraryView.js";
import { SdCardPanel } from "./SdCardPanel.js";

type RecordingTab = "library" | "sd-card";

export function RecordingsView({
  cameras,
}: {
  cameras: CameraSummary[];
}): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<RecordingTab>("library");
  const libraryTabRef = useRef<HTMLButtonElement>(null);
  const sdCardTabRef = useRef<HTMLButtonElement>(null);

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    let nextTab: RecordingTab;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        nextTab = activeTab === "library" ? "sd-card" : "library";
        break;
      case "Home":
        nextTab = "library";
        break;
      case "End":
        nextTab = "sd-card";
        break;
      default:
        return;
    }

    event.preventDefault();
    setActiveTab(nextTab);
    (nextTab === "library" ? libraryTabRef : sdCardTabRef).current?.focus();
  }

  return (
    <div className="recordings-page">
      <div
        className="recordings-tabs"
        role="tablist"
        aria-label="Fontes de gravação"
        onKeyDown={handleTabKeyDown}
      >
        <button
          ref={libraryTabRef}
          id="recordings-tab-library"
          type="button"
          role="tab"
          aria-selected={activeTab === "library"}
          aria-controls="recordings-panel-library"
          tabIndex={activeTab === "library" ? 0 : -1}
          onClick={() => setActiveTab("library")}
        >
          <FolderIcon size={18} />
          Biblioteca local
        </button>
        <button
          ref={sdCardTabRef}
          id="recordings-tab-sd-card"
          type="button"
          role="tab"
          aria-selected={activeTab === "sd-card"}
          aria-controls="recordings-panel-sd-card"
          tabIndex={activeTab === "sd-card" ? 0 : -1}
          onClick={() => setActiveTab("sd-card")}
        >
          <CameraIcon size={18} />
          Cartão SD
        </button>
      </div>
      <div
        id="recordings-panel-library"
        className="recordings-tab-panel"
        role="tabpanel"
        aria-labelledby="recordings-tab-library"
        tabIndex={0}
        hidden={activeTab !== "library"}
      >
        {activeTab === "library" && (
          <LibraryView cameras={cameras} mode="recordings" />
        )}
      </div>
      <div
        id="recordings-panel-sd-card"
        className="recordings-tab-panel"
        role="tabpanel"
        aria-labelledby="recordings-tab-sd-card"
        tabIndex={0}
        hidden={activeTab !== "sd-card"}
      >
        <SdCardPanel />
      </div>
    </div>
  );
}
