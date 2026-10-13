use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: String,
    pub title: String,
    pub description: String,
    pub body: String,
    pub category_id: String,
    pub category_name: String,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub pin_order: Option<i64>,
    pub copy_count: i64,
    pub last_copied_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub body: String,
    pub category_id: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub is_pinned: bool,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PromptView {
    #[default]
    All,
    Recent,
    Favorite,
    Pinned,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PromptTab {
    #[default]
    All,
    Favorite,
    Template,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PromptSort {
    #[default]
    Recent,
    Popular,
    Name,
}

fn default_limit() -> i64 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct PromptQuery {
    pub search: Option<String>,
    pub view: PromptView,
    pub tab: PromptTab,
    pub category_id: Option<String>,
    pub sort: PromptSort,
    pub limit: i64,
    pub offset: i64,
}

impl Default for PromptQuery {
    fn default() -> Self {
        Self {
            search: None,
            view: PromptView::All,
            tab: PromptTab::All,
            category_id: None,
            sort: PromptSort::Recent,
            limit: default_limit(),
            offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptPage {
    pub items: Vec<Prompt>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub color: String,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub prompt_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total: i64,
    pub recent: i64,
    pub favorites: i64,
    pub pinned: i64,
    pub templates: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CopyStats {
    pub copy_count: i64,
    pub last_copied_at: i64,
}
