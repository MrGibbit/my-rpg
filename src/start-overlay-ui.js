export function createStartOverlayUI(deps) {
  const {
    startOverlay,
    startCharStatus,
    startCharMeta,
    startSaveStatus,
    startSaveMeta,
    startContinueBtn,
    getStoredCharacterProfile,
    getStoredSaveProfile,
    getActiveCharacterId,
    formatSavedAtLabel
  } = deps;

  function closeStartOverlay() {
    if (!startOverlay) return;
    startOverlay.style.display = "none";
  }

  function refreshStartOverlay() {
    if (!startOverlay) return;

    const charProfile = getStoredCharacterProfile();
    const saveProfile = getStoredSaveProfile();

    if (startCharStatus) startCharStatus.textContent = charProfile ? "Ready" : "No Character";
    if (startCharMeta) {
      startCharMeta.textContent = charProfile
        ? `${charProfile.name} the ${charProfile.class}${getActiveCharacterId() ? " (Active)" : ""}`
        : "Create a character to start a new game.";
    }

    if (startSaveStatus) startSaveStatus.textContent = saveProfile ? "Available" : "No Save";
    if (startSaveMeta) {
      startSaveMeta.textContent = saveProfile
        ? `${saveProfile.name} the ${saveProfile.class} - HP ${saveProfile.hp}/${saveProfile.maxHp} - Saved ${formatSavedAtLabel(saveProfile.savedAt)}`
        : "No save data found yet.";
    }

    if (startContinueBtn) startContinueBtn.disabled = !saveProfile;
  }

  function openStartOverlay() {
    if (!startOverlay) return;
    refreshStartOverlay();
    startOverlay.style.display = "flex";
  }

  return {
    closeStartOverlay,
    refreshStartOverlay,
    openStartOverlay
  };
}
