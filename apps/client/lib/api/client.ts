import axios from "axios";

export const api = axios.create({
  baseURL: "",
  timeout: 15_000,
  headers: { Accept: "application/json" },
});
