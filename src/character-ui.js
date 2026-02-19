export function createCharacterUI(deps) {
  const {
    classDefs,
    characterState,
    player,
    charOverlay,
    charName,
    charColorPill,
    charStart,
    classPick,
    startNewCharacterBtn,
    loadCharOverlay,
    loadCharList,
    loadCharEmpty,
    loadCharCancel,
    deleteCharBtn,
    newCharBtn,
    deleteCharOverlay,
    deleteCharCancel,
    deleteCharConfirm,
    loadCharacterPrefs,
    loadCharacterList,
    saveCharacterList,
    getSaveKeyForCharId,
    getActiveCharacterId,
    setActiveCharacterId,
    getStoredCharacterProfile,
    getStoredSaveProfile,
    formatSavedAtLabel,
    saveCharacterPrefs,
    refreshStartOverlay,
    closeStartOverlay,
    openStartOverlay,
    startNewGame,
    resetCharacter,
    showTownboardingModal,
    chatLine
  } = deps;

  let createNewCharacterPending = false;

  function setSelectedClass(cls) {
    if (!classDefs[cls]) cls = "Warrior";
    characterState.selectedClass = cls;
    for (const btn of classPick.querySelectorAll("button[data-class]")) {
      btn.classList.toggle("active", btn.dataset.class === characterState.selectedClass);
    }
    charColorPill.textContent = classDefs[characterState.selectedClass].color;
  }

  function closeLoadCharOverlay() {
    if (!loadCharOverlay) return;
    loadCharOverlay.style.display = "none";
  }

  function openCharCreate(force = false, createNew = false) {
    createNewCharacterPending = !!createNew;
    const saved = loadCharacterPrefs();

    if (!createNewCharacterPending) {
      if (saved?.name) player.name = String(saved.name).slice(0, 14);
      if (saved?.class && classDefs[saved.class]) player.class = saved.class;
      if (saved?.color) player.color = saved.color;
    }

    if (!createNewCharacterPending && !force && saved?.class && saved?.name) {
      player.color = classDefs[player.class]?.color ?? player.color;
      characterState.selectedClass = player.class;
      return false;
    }

    charName.value = createNewCharacterPending ? "Adventurer" : (player.name || "Adventurer");
    setSelectedClass(createNewCharacterPending ? "Warrior" : (player.class || "Warrior"));
    charOverlay.style.display = "flex";
    return true;
  }

  function applyCharacterProfileToPlayer(charProfile) {
    if (!charProfile) return;
    player.name = String(charProfile.name || "Adventurer").slice(0, 14);
    player.class = (charProfile.class && classDefs[charProfile.class]) ? charProfile.class : "Warrior";
    player.color = classDefs[player.class].color;
  }

  function deleteCharacterById(charId) {
    if (!charId) return false;
    const before = loadCharacterList();
    const next = before.filter((c) => c.id !== charId);
    if (next.length === before.length) return false;

    saveCharacterList(next);
    try {
      localStorage.removeItem(getSaveKeyForCharId(charId));
    } catch {}

    if (getActiveCharacterId() === charId) {
      setActiveCharacterId(next[0]?.id ?? null);
    }
    return true;
  }

  function renderLoadCharacterList(onLoad) {
    if (!loadCharList) return;
    const chars = loadCharacterList();
    loadCharList.innerHTML = "";

    let withSaveCount = 0;
    const activeId = getActiveCharacterId();

    for (const c of chars) {
      const save = getStoredSaveProfile(c.id);
      if (save) withSaveCount++;

      const row = document.createElement("div");
      row.className = "loadCharRow";

      const meta = document.createElement("div");
      meta.className = "loadCharMeta";
      const title = document.createElement("div");
      title.className = "loadCharTitle";
      title.textContent = `${c.name} the ${c.class}${c.id === activeId ? " (Active)" : ""}`;
      meta.appendChild(title);

      const sub = document.createElement("div");
      sub.className = "loadCharSub";
      sub.textContent = save
        ? `Level ${save.combatLevel} - Saved ${formatSavedAtLabel(save.savedAt)}`
        : "No save found for this character";
      meta.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "btnrow";

      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.textContent = "Load";
      loadBtn.disabled = !save;
      loadBtn.addEventListener("click", () => onLoad(c.id));
      actions.appendChild(loadBtn);

      row.appendChild(meta);
      row.appendChild(actions);
      loadCharList.appendChild(row);
    }

    if (loadCharEmpty) {
      loadCharEmpty.style.display = (withSaveCount > 0) ? "none" : "";
    }
  }

  function openLoadCharacterOverlay(onLoad) {
    if (!loadCharOverlay) return;
    renderLoadCharacterList(onLoad);
    loadCharOverlay.style.display = "flex";
  }

  function openDeleteConfirm() { deleteCharOverlay.style.display = "flex"; }
  function closeDeleteConfirm() { deleteCharOverlay.style.display = "none"; }

  classPick.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-class]");
    if (!btn) return;
    setSelectedClass(btn.dataset.class);
  });

  if (loadCharCancel) {
    loadCharCancel.addEventListener("click", closeLoadCharOverlay);
  }
  if (loadCharOverlay) {
    loadCharOverlay.addEventListener("mousedown", (e) => {
      if (e.target === loadCharOverlay) closeLoadCharOverlay();
    });
  }

  if (deleteCharBtn) deleteCharBtn.onclick = openDeleteConfirm;
  if (deleteCharCancel) deleteCharCancel.onclick = closeDeleteConfirm;
  if (deleteCharOverlay) {
    deleteCharOverlay.addEventListener("mousedown", (e) => {
      if (e.target === deleteCharOverlay) closeDeleteConfirm();
    });
  }
  if (deleteCharConfirm) {
    deleteCharConfirm.onclick = () => {
      closeDeleteConfirm();
      resetCharacter();
      refreshStartOverlay();
      const next = getStoredCharacterProfile();
      if (next) {
        applyCharacterProfileToPlayer(next);
        openStartOverlay();
      } else {
        openCharCreate(true, true);
      }
      chatLine(`<span class="warn">Character deleted.</span>`);
    };
  }

  if (newCharBtn) {
    newCharBtn.onclick = () => {
      refreshStartOverlay();
      openCharCreate(true, true);
    };
  }

  if (startNewCharacterBtn) {
    startNewCharacterBtn.onclick = () => {
      closeStartOverlay();
      openCharCreate(true, true);
    };
  }

  if (charStart) {
    charStart.onclick = () => {
      player.name = (charName.value || "Adventurer").trim().slice(0, 14) || "Adventurer";
      player.class = characterState.selectedClass;
      player.color = classDefs[characterState.selectedClass].color;

      const created = saveCharacterPrefs({ createNew: createNewCharacterPending });
      if (created?.id) {
        setActiveCharacterId(created.id);
      }
      createNewCharacterPending = false;
      refreshStartOverlay();
      closeStartOverlay();
      charOverlay.style.display = "none";

      if (created?.id) {
        player._hasSeenTownOnboarding = false;
      }
      startNewGame();
      if (typeof showTownboardingModal === "function") {
        showTownboardingModal();
      }
      chatLine(`<span class="good">Welcome, ${player.name} the ${player.class}.</span>`);
    };
  }

  return {
    closeLoadCharOverlay,
    openCharCreate,
    applyCharacterProfileToPlayer,
    deleteCharacterById,
    openLoadCharacterOverlay
  };
}
