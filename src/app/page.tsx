import { Dashboard } from "@/components/dashboard";
import { demoState } from "@/lib/demo";

export default function Home() {
  return (
    <Dashboard
      initialState={{
        ...demoState,
        demo: false,
        status: "Đang mở cửa hang",
        thought: "Shoyru đang mang nhật ký ra, chờ mình một chút nhé.",
        conversations: [],
        activities: [],
      }}
    />
  );
}
