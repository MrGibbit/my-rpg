export function attachInventoryInputHandlers(deps) {
  const {
    invGrid,
    bankGrid,
    eqWeaponSlot,
    eqOffhandSlot,
    eqHeadSlot,
    eqBodySlot,
    eqLegsSlot,
    eqHandsSlot,
    eqFeetSlot,
    inv,
    bank,
    windowsOpen,
    depositFromInv,
    consumeFoodFromInv,
    useState,
    handleUseOnSelf,
    setUseState,
    tryItemOnItem,
    isStickyUseTool,
    canEquip,
    equipFromInv,
    withdrawFromBank,
    equipment,
    emptyInvSlots,
    chatLine,
    unequipSlot
  } = deps;

  invGrid.addEventListener("mousedown", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot) return;
    const idx = parseInt(slot.dataset.index, 10);
    if (!inv[idx]) return;
    if (e.button !== 0) return; // only left-click

    if (windowsOpen.bank) {
      depositFromInv(idx, 1);
      return;
    }

    if (inv[idx].noted) {
      chatLine(`<span class="muted">Notes can only be sold or banked.</span>`);
      return;
    }

    if (useState.activeItemId) {
      const toolId = useState.activeItemId;
      if (!inv.some((slot) => slot && slot.id === toolId)) {
        setUseState(null);
      }
    }

    if (consumeFoodFromInv(idx)) return;

    if (useState.activeItemId) {
      const toolId = useState.activeItemId;
      const targetId = inv[idx].id;

      if (toolId === targetId) {
        handleUseOnSelf(toolId);
        setUseState(null);
        return;
      }

      const handled = tryItemOnItem(toolId, targetId, idx);
      const sticky = isStickyUseTool(toolId);
      if (!handled || !sticky) setUseState(null);
      return;
    }

    if (inv[idx].id === "xp_lamp") {
      handleUseOnSelf("xp_lamp");
      return;
    }

    if (canEquip(inv[idx].id)) {
      equipFromInv(idx);
    }
  });

  // Bank: left-click withdraw one.
  bankGrid.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const slot = e.target.closest(".slot");
    if (!slot) return;
    const idx = parseInt(slot.dataset.index, 10);
    if (!bank[idx]) return;
    withdrawFromBank(idx, 1);
  });

  if (eqWeaponSlot) {
    eqWeaponSlot.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!equipment.weapon) return;
      if (emptyInvSlots() <= 0) {
        chatLine(`<span class="warn">Inventory full.</span>`);
        return;
      }
      unequipSlot("weapon");
    });
  }

  if (eqOffhandSlot) {
    eqOffhandSlot.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!equipment.offhand) return;
      if (emptyInvSlots() <= 0) {
        chatLine(`<span class="warn">Inventory full.</span>`);
        return;
      }
      unequipSlot("offhand");
    });
  }

  if (eqHeadSlot) {
    eqHeadSlot.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!equipment.head) return;
      if (emptyInvSlots() <= 0) {
        chatLine(`<span class="warn">Inventory full.</span>`);
        return;
      }
      unequipSlot("head");
    });
  }

  if (eqBodySlot) {
    eqBodySlot.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!equipment.body) return;
      if (emptyInvSlots() <= 0) {
        chatLine(`<span class="warn">Inventory full.</span>`);
        return;
      }
      unequipSlot("body");
    });
  }

  if (eqLegsSlot) {
    eqLegsSlot.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!equipment.legs) return;
      if (emptyInvSlots() <= 0) {
        chatLine(`<span class="warn">Inventory full.</span>`);
        return;
      }
      unequipSlot("legs");
    });
  }

  if (eqHandsSlot) {
    eqHandsSlot.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!equipment.hands) return;
      if (emptyInvSlots() <= 0) {
        chatLine(`<span class="warn">Inventory full.</span>`);
        return;
      }
      unequipSlot("hands");
    });
  }

  if (eqFeetSlot) {
    eqFeetSlot.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!equipment.feet) return;
      if (emptyInvSlots() <= 0) {
        chatLine(`<span class="warn">Inventory full.</span>`);
        return;
      }
      unequipSlot("feet");
    });
  }
}
