import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SettingsView from "../components/settings/SettingsView";
import { useTheme } from "../theme/ThemeContext";

function Settings() {
  const navigate = useNavigate();
  const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";

  const { darkMode, toggleDarkMode } = useTheme();

  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  const [tab, setTab] = useState("account");

  // Modal state
  // type: 'email'|'password'|'username'|'name'|'delete'
  const [modal, setModal] = useState(null);
  const [modalForm, setModalForm] = useState({
    newName: "",
    newUsername: "",
    newEmail: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  function openModal(type) {
    setStatus({ type: "", message: "" });
    setModal({ type });
    setModalForm({
      newName: "",
      newUsername: "",
      newEmail: "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  }

  function closeModal() {
    setModal(null);
    setModalForm({
      newName: "",
      newUsername: "",
      newEmail: "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  }

  function onModalChange(e) {
    const { name, value } = e.target;
    setModalForm((f) => ({ ...f, [name]: value }));
    if (status.message) setStatus({ type: "", message: "" });
  }

  // Load current user
  useEffect(() => {
    async function fetchUser() {
      const token = localStorage.getItem("token");
      if (!token) {
        setStatus({
          type: "error",
          message: "You must be logged in to view Settings.",
        });
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/account`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Failed to load account data.");

        const user = data.user || {};
        setOriginal({
          name: user.name || "",
          username: user.username || "",
          email: user.email || "",
        });

        setStatus({ type: "", message: "" });
      } catch (err) {
        setStatus({ type: "error", message: err.message || "Server error." });
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, [API_BASE]);

  function handleLogout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  async function confirmDeleteAccount() {
    if (saving) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setStatus({ type: "error", message: "You are not logged in." });
      return;
    }

    setSaving(true);
    setStatus({ type: "", message: "" });

    try {
      const res = await fetch(`${API_BASE}/api/account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Unable to delete account.");

      closeModal();
      localStorage.removeItem("token");
      navigate("/signup"); // or "/login"
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Server error." });
    } finally {
      setSaving(false);
    }
  }

  async function saveModal() {
    if (!modal?.type || !original || saving) return;

    // Delete account via modal
    if (modal.type === "delete") {
      await confirmDeleteAccount();
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setStatus({ type: "error", message: "You are not logged in." });
      return;
    }

    const payload = {};

    // Build payload based on modal type
    if (modal.type === "name") {
      const newName = modalForm.newName.trim();
      if (!newName || newName === original.name) {
        setStatus({ type: "info", message: "No change to save." });
        return;
      }
      payload.name = newName;
    }

    if (modal.type === "username") {
      const newUsername = modalForm.newUsername.trim();
      if (!newUsername || newUsername === original.username) {
        setStatus({ type: "info", message: "No change to save." });
        return;
      }
      payload.username = newUsername;
    }

    if (modal.type === "email") {
      const newEmail = modalForm.newEmail.trim().toLowerCase();
      if (!newEmail || newEmail === (original.email || "").toLowerCase()) {
        setStatus({ type: "info", message: "No change to save." });
        return;
      }
      if (!modalForm.currentPassword) {
        setStatus({
          type: "error",
          message: "Current password is required to change email.",
        });
        return;
      }
      payload.email = newEmail;
      payload.currentPassword = modalForm.currentPassword;
    }

    if (modal.type === "password") {
      const { currentPassword, newPassword, confirmPassword } = modalForm;

      if (!currentPassword) {
        setStatus({
          type: "error",
          message: "Current password is required to change password.",
        });
        return;
      }
      if (!newPassword || !confirmPassword) {
        setStatus({
          type: "error",
          message: "Please enter and confirm your new password.",
        });
        return;
      }
      if (newPassword !== confirmPassword) {
        setStatus({
          type: "error",
          message: "New password and confirmation do not match.",
        });
        return;
      }
      if (newPassword.length < 6) {
        setStatus({
          type: "error",
          message: "New password must be at least 6 characters.",
        });
        return;
      }

      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }

    // Safety: should never happen, but prevents empty PUT
    if (Object.keys(payload).length === 0) {
      setStatus({ type: "info", message: "No changes to save." });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/account`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Unable to save changes.");

      const updated = data.user || {};
      setOriginal({
        name: updated.name ?? original.name,
        username: updated.username ?? original.username,
        email: updated.email ?? original.email,
      });

      setStatus({ type: "success", message: data.message || "Changes saved." });
      closeModal();
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Server error." });
    } finally {
      setSaving(false);
    }
  }

  function onDeleteAccount() {
    openModal("delete");
  }

  return (
    <SettingsView
      status={status}
      loading={loading}
      saving={saving}
      original={original}
      tab={tab}
      setTab={setTab}
      modal={modal}
      modalForm={modalForm}
      onModalChange={onModalChange}
      openModal={openModal}
      closeModal={closeModal}
      saveModal={saveModal}
      onLogout={handleLogout}
      onDeleteAccount={onDeleteAccount}
      darkMode={darkMode}
      toggleDarkMode={toggleDarkMode}
    />
  );
}

export default Settings;