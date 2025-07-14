// Service d'authentification mocké pour fonctionner sans base de données

export const getMockSession = () => {
  return {
    user: {
      id: "mock-user-1",
      name: "Utilisateur",
      email: "demo@example.com",
      emailVerified: true,
      image: "/pf.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: "mock-session-1",
      userId: "mock-user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours
    },
  };
};

export const getMockUser = () => getMockSession().user;
