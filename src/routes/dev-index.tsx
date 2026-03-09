import { Link } from "react-router";

const FIXTURE_IDS = Object.keys(
  import.meta.glob("/scripts/youtube-json/*/metadata.json"),
).map((p) => p.split("/")[3]);

export function DevIndexPage() {
  return (
    <div className="mx-auto max-w-lg p-4">
      <h1 className="mb-4 text-lg font-medium">Dev Viewer</h1>
      <ul className="flex flex-col gap-2">
        {FIXTURE_IDS.map((id) => (
          <li key={id}>
            <Link
              to={`/dev/youtube/${id}`}
              className="text-sm text-accent underline hover:no-underline"
            >
              {id}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
