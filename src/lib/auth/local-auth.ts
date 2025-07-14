// Système d'authentification simple avec localStorage - SANS PostgreSQL
import React from "react";

export interface LocalUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  createdAt: string;
  loginTime?: string;
}

export interface LocalSession {
  id: string;
  email: string;
  name: string;
  avatar: string;
  loginTime: string;
}

// Classe pour gérer l'authentification locale
export class LocalAuth {
  private static instance: LocalAuth;

  static getInstance(): LocalAuth {
    if (!LocalAuth.instance) {
      LocalAuth.instance = new LocalAuth();
    }
    return LocalAuth.instance;
  }

  // Obtenir la session actuelle
  getSession(): LocalSession | null {
    if (typeof window === "undefined") return null;

    try {
      const session = localStorage.getItem("sara_user_session");
      if (session) {
        return JSON.parse(session);
      }
    } catch (error) {
      console.error("Erreur lors de la lecture de la session:", error);
    }
    return null;
  }

  // Vérifier si l'utilisateur est connecté
  isAuthenticated(): boolean {
    return this.getSession() !== null;
  }

  // Connexion utilisateur
  signIn(email: string, password: string): LocalSession | null {
    if (typeof window === "undefined") return null;

    try {
      // Récupérer la liste des utilisateurs
      const users = this.getUsers();
      const passwords = this.getPasswords();

      // Chercher l'utilisateur par email
      const user = users.find((u) => u.email === email);

      if (user && passwords[user.id] === password) {
        // Créer la session
        const session: LocalSession = {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          loginTime: new Date().toISOString(),
        };

        // Sauvegarder la session
        localStorage.setItem("sara_user_session", JSON.stringify(session));
        localStorage.setItem(
          "sara_auth_token",
          `token_${user.id}_${Date.now()}`,
        );

        return session;
      }
    } catch (error) {
      console.error("Erreur lors de la connexion:", error);
    }
    return null;
  }

  // Inscription utilisateur
  signUp(name: string, email: string, password: string): LocalSession | null {
    if (typeof window === "undefined") return null;

    try {
      const users = this.getUsers();
      const passwords = this.getPasswords();

      // Vérifier si l'utilisateur existe déjà
      if (users.find((u) => u.email === email)) {
        return null; // Utilisateur existe déjà
      }

      // Créer un nouvel utilisateur
      const newUser: LocalUser = {
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        email,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
        createdAt: new Date().toISOString(),
      };

      // Sauvegarder l'utilisateur
      users.push(newUser);
      passwords[newUser.id] = password;

      localStorage.setItem("sara_users", JSON.stringify(users));
      localStorage.setItem("sara_passwords", JSON.stringify(passwords));

      // Créer la session automatiquement
      const session: LocalSession = {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        avatar: newUser.avatar,
        loginTime: new Date().toISOString(),
      };

      localStorage.setItem("sara_user_session", JSON.stringify(session));
      localStorage.setItem(
        "sara_auth_token",
        `token_${newUser.id}_${Date.now()}`,
      );

      return session;
    } catch (error) {
      console.error("Erreur lors de l'inscription:", error);
    }
    return null;
  }

  // Déconnexion
  signOut(): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.removeItem("sara_user_session");
      localStorage.removeItem("sara_auth_token");

      // Recharger la page pour rediriger vers la connexion
      window.location.href = "/sign-in";
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
    }
  }

  // Obtenir la liste des utilisateurs
  private getUsers(): LocalUser[] {
    if (typeof window === "undefined") return [];

    try {
      const users = localStorage.getItem("sara_users");
      return users ? JSON.parse(users) : [];
    } catch (error) {
      console.error("Erreur lors de la lecture des utilisateurs:", error);
      return [];
    }
  }

  // Obtenir les mots de passe
  private getPasswords(): Record<string, string> {
    if (typeof window === "undefined") return {};

    try {
      const passwords = localStorage.getItem("sara_passwords");
      return passwords ? JSON.parse(passwords) : {};
    } catch (error) {
      console.error("Erreur lors de la lecture des mots de passe:", error);
      return {};
    }
  }

  // Initialiser un utilisateur de démonstration
  initializeDemoUser(): void {
    if (typeof window === "undefined") return;

    const users = this.getUsers();
    const passwords = this.getPasswords();

    // Vérifier si l'utilisateur de demo existe déjà
    if (!users.find((u) => u.email === "demo@sara.ai")) {
      const demoUser: LocalUser = {
        id: "demo_user_sara_ai",
        name: "Utilisateur Démo",
        email: "demo@sara.ai",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=demo@sara.ai",
        createdAt: new Date().toISOString(),
      };

      users.push(demoUser);
      passwords[demoUser.id] = "demo123";

      localStorage.setItem("sara_users", JSON.stringify(users));
      localStorage.setItem("sara_passwords", JSON.stringify(passwords));
    }
  }
}

// Instance globale
export const localAuth = LocalAuth.getInstance();

// Hook React pour utiliser l'authentification locale
export function useLocalAuth() {
  const [user, setUser] = React.useState<LocalSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    // Initialiser l'utilisateur de demo
    localAuth.initializeDemoUser();

    // Récupérer la session actuelle
    const session = localAuth.getSession();
    setUser(session);
    setIsAuthenticated(session !== null);
  }, []);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const session = localAuth.signIn(email, password);
    if (session) {
      setUser(session);
      setIsAuthenticated(true);
      return session;
    }
    return null;
  }, []);

  const signUp = React.useCallback(
    async (name: string, email: string, password: string) => {
      const session = localAuth.signUp(name, email, password);
      if (session) {
        setUser(session);
        setIsAuthenticated(true);
        return session;
      }
      return null;
    },
    [],
  );

  const signOut = React.useCallback(() => {
    localAuth.signOut();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  return {
    user,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
  };
}
