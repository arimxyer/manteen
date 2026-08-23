import { ArticleCard } from "../../../../../registry/mantine-ui/article-card/article-card";
import styles from "./article-card.playground.module.css";
import type { PlaygroundAdapter } from "./contract";

const ARTICLE_DESCRIPTION =
  "A field guide to building systems that remain clear, useful, and adaptable as the work evolves.";
const BASE_URL = import.meta.env.BASE_URL.replace(/\/?$/, "/");
const IMAGE_BUNDLED = `${BASE_URL}registry-assets/article-card/article-card-preview.jpg`;
// The bundled stage asset was saved from this URL, so it is NOT offered as a select option
// (it would render the identical picture); it exists only as the remote stand-in Copy JSX
// substitutes for the bundled asset.
const IMAGE_BUNDLED_REMOTE =
  "https://images.unsplash.com/photo-1778084356053-40103587d24f?auto=format&fit=crop&w=1080&q=80";
const IMAGE_CATALOG =
  "https://images.unsplash.com/photo-1778084356053-40103587d24f?auto=format&fit=crop&w=360&q=55";
const IMAGE_FOREST =
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1080&q=80";
const IMAGE_LANDSCAPE =
  "https://images.unsplash.com/photo-1527004013197-933c4bb611b3?auto=format&fit=crop&w=1080&q=80";

const adapter: PlaygroundAdapter = {
  item: "article-card",
  defaultProps: {
    title: "How resilient teams design for change",
    authorName: "Avery Stone",
    rating: "4.9",
    actions: true,
    image: IMAGE_BUNDLED,
  },
  controls: [
    { kind: "text", prop: "title", label: "Title", wide: true },
    { kind: "text", prop: "authorName", label: "Author" },
    {
      kind: "text",
      prop: "rating",
      label: "Rating",
      inputMode: "decimal",
      maxLength: 4,
      compact: true,
    },
    {
      kind: "select",
      prop: "image",
      label: "Image",
      options: [
        { label: "Workshop (bundled)", value: IMAGE_BUNDLED },
        { label: "Forest (Unsplash)", value: IMAGE_FOREST },
        { label: "Landscape (Unsplash)", value: IMAGE_LANDSCAPE },
      ],
    },
    { kind: "switch", prop: "actions", label: "Actions" },
  ],
  render: (props, recordEvent, context) => (
    <ArticleCard
      image={context.surface === "catalog" ? IMAGE_CATALOG : String(props.image)}
      title={String(props.title) || "Untitled article"}
      description={ARTICLE_DESCRIPTION}
      authorName={String(props.authorName) || "Unknown author"}
      rating={String(props.rating) || undefined}
      href="#"
      onLike={props.actions ? () => recordEvent("onLike") : undefined}
      onBookmark={props.actions ? () => recordEvent("onBookmark") : undefined}
      onShare={props.actions ? () => recordEvent("onShare") : undefined}
      classNames={{
        root: styles.articleCard,
        image: styles.articleImage,
        rating: styles.articleRating,
        title: styles.articleTitle,
        footer: styles.articleFooter,
        action: styles.articleAction,
      }}
    />
  ),
  renderJsx: (props) => {
    // The bundled stage asset is a docs-site URL — copied JSX swaps in the canonical remote
    // image so the snippet works when pasted into a consumer project.
    const image = props.image === IMAGE_BUNDLED ? IMAGE_BUNDLED_REMOTE : String(props.image);
    const actionProps = props.actions
      ? "\n  onLike={() => {}}\n  onBookmark={() => {}}\n  onShare={() => {}}"
      : "";

    return `<ArticleCard
  image=${JSON.stringify(image)}
  title=${JSON.stringify(props.title)}
  description=${JSON.stringify(ARTICLE_DESCRIPTION)}
  authorName=${JSON.stringify(props.authorName)}
  rating=${JSON.stringify(props.rating)}
  href="/articles/resilient-teams"${actionProps}
/>`;
  },
  stage: {
    desktopWidth: "min(32.5rem, 100%)",
    mobileWidth: "min(20rem, 100%)",
  },
};

export default adapter;
