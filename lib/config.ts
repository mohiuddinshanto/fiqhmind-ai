// The configured API base. `NEXT_PUBLIC_API_URL` may be supplied either as a
// bare origin (`https://fiqhmind-ai-backend.onrender.com`) or as the full
// `/api/v1` base; normalize so endpoint construction (`${API_URL}/chat`,
// `${API_URL}/uploads`) never produces a missing prefix or a double slash.
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "https://fiqhmind-ai-backend.onrender.com"
)
  .trim()
  .replace(/\/+$/, "");

export const API_URL = API_BASE_URL.endsWith("/api/v1")
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;
