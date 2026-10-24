import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"

import { routes } from "./app/router/routes"

import "./app/styles/globals.css"
import "@xyflow/react/dist/style.css"

const router = createBrowserRouter(routes)

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
)
