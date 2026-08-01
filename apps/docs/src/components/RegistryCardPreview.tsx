import {
  IconArrowsSort,
  IconCheck,
  IconCloudUpload,
  IconFileDescription,
  IconGripVertical,
  IconLayoutDashboard,
  IconSparkles,
} from "@tabler/icons-react";

import styles from "./RegistryCardPreview.module.css";

interface Props {
  name: string;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/?$/, "/");
const ARTICLE_IMAGE = `${BASE_URL}registry-assets/gallery/article-card.jpg`;

function ArticleCardPreview() {
  return (
    <article className={styles.articleMini}>
      <img src={ARTICLE_IMAGE} alt="" />
      <div>
        <span>4.9</span>
        <strong>Designing for change</strong>
        <small>Systems that stay useful.</small>
        <small>Avery Stone</small>
      </div>
    </article>
  );
}

function AuthenticationPreview() {
  return (
    <form className={styles.authMini}>
      <strong>Welcome back</strong>
      <input aria-label="Email address" placeholder="Email address" readOnly tabIndex={-1} />
      <input aria-label="Password" placeholder="Password" readOnly tabIndex={-1} />
      <button type="button" tabIndex={-1}>
        Sign in
      </button>
    </form>
  );
}

function CarouselPreview() {
  return (
    <ul className={styles.carouselMini}>
      <li>Oslo</li>
      <li>Kyoto</li>
      <li>Sedona</li>
    </ul>
  );
}

function DropzonePreview() {
  return (
    <div className={styles.dropzoneMini}>
      <IconCloudUpload size={24} stroke={1.6} />
      <strong>Drop files here</strong>
      <small>PDF, PNG, or JPG</small>
    </div>
  );
}

function ThemePreview() {
  const tokens = [
    ["Primary", "primary"],
    ["Surface", "surface"],
    ["Success", "success"],
    ["Text", "text"],
  ] as const;

  return (
    <dl className={styles.themeMini}>
      {tokens.map(([label, token]) => (
        <div key={token}>
          <dt className={styles[token]}>
            <span className={styles.visuallyHidden}>{label}</span>
          </dt>
          <dd>{label}</dd>
        </div>
      ))}
    </dl>
  );
}

function DataTablePreview({ sortable = false }: { sortable?: boolean }) {
  return (
    <table className={styles.tableMini}>
      <thead>
        <tr>
          <th>Name</th>
          <th>
            {sortable ? (
              <span className={styles.sortHeader}>
                <IconArrowsSort size={10} stroke={1.8} />
                Company
              </span>
            ) : (
              "Company"
            )}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Avery Stone</td>
          <td>Northstar</td>
        </tr>
        <tr>
          <td>Mina Chen</td>
          <td>Lattice</td>
        </tr>
        <tr>
          <td>Leo Brooks</td>
          <td>Arcade</td>
        </tr>
      </tbody>
    </table>
  );
}

function EmptyStatePreview() {
  return (
    <div className={styles.emptyMini}>
      <IconSparkles size={26} stroke={1.6} />
      <strong>No projects yet</strong>
      <small>Create one to get started.</small>
      <span>New project</span>
    </div>
  );
}

function PageHeaderPreview() {
  return (
    <header className={styles.headerMini}>
      <small>Workspace / Overview</small>
      <div>
        <strong>Project overview</strong>
        <span>New project</span>
      </div>
      <p>Track the work your team is shipping.</p>
    </header>
  );
}

function StatCardPreview() {
  return (
    <article className={styles.statMini}>
      <small>Monthly revenue</small>
      <strong>$48,240</strong>
      <span>+12.4%</span>
    </article>
  );
}

function ProgressButtonPreview() {
  return (
    <div className={styles.progressMini}>
      <button type="button" tabIndex={-1}>
        <IconCheck size={16} stroke={2} /> Published
      </button>
      <span>
        <i />
      </span>
      <small>Upload complete</small>
    </div>
  );
}

function SortableListPreview() {
  return (
    <ol className={styles.listMini}>
      {["Research", "Prototype", "Ship"].map((label) => (
        <li key={label}>
          <IconGripVertical size={13} stroke={1.8} />
          {label}
        </li>
      ))}
    </ol>
  );
}

function StatsGridPreview() {
  return (
    <div className={styles.statsGridMini}>
      {["Users", "Sessions", "Growth"].map((label, index) => (
        <article key={label}>
          <IconLayoutDashboard size={13} stroke={1.6} />
          <small>{label}</small>
          <strong>{["12.8k", "31.4k", "+18%"][index]}</strong>
        </article>
      ))}
    </div>
  );
}

function FilePreview() {
  return (
    <div className={styles.fileMini}>
      <IconFileDescription size={38} stroke={1.4} />
      <div>
        <strong>MANTINE-UI.txt</strong>
        <small>License and attribution file</small>
      </div>
    </div>
  );
}

export function RegistryCardPreview({ name }: Props) {
  let preview = <FilePreview />;

  switch (name) {
    case "article-card":
      preview = <ArticleCardPreview />;
      break;
    case "authentication-form":
      preview = <AuthenticationPreview />;
      break;
    case "cards-carousel":
      preview = <CarouselPreview />;
      break;
    case "dropzone-button":
      preview = <DropzonePreview />;
      break;
    case "theme":
      preview = <ThemePreview />;
      break;
    case "data-table":
      preview = <DataTablePreview />;
      break;
    case "empty-state":
      preview = <EmptyStatePreview />;
      break;
    case "page-header":
      preview = <PageHeaderPreview />;
      break;
    case "stat-card":
      preview = <StatCardPreview />;
      break;
    case "button-progress":
      preview = <ProgressButtonPreview />;
      break;
    case "dnd-list":
      preview = <SortableListPreview />;
      break;
    case "stats-grid":
      preview = <StatsGridPreview />;
      break;
    case "table-sort":
      preview = <DataTablePreview sortable />;
      break;
    default:
      preview = <FilePreview />;
  }

  return (
    <div className={styles.preview} aria-hidden="true">
      {preview}
    </div>
  );
}
