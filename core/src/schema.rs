// @generated automatically by Diesel CLI.

diesel::table! {
    projects (id) {
        id -> Integer,
        name -> Text,
        description -> Text,
        summary -> Text,
        task_id -> Nullable<Text>,
        workspace_id -> Integer,
        status -> Text,
        start_time -> Nullable<Timestamp>,
        iteration_count -> Integer,
        worktree_path -> Nullable<Text>,
        branch_name -> Nullable<Text>,
        created_at -> Timestamp,
    }
}

diesel::table! {
    settings (key) {
        key -> Text,
        value -> Text,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    workspaces (id) {
        id -> Integer,
        name -> Text,
        path -> Text,
        created_at -> Timestamp,
    }
}

diesel::allow_tables_to_appear_in_same_query!(projects, settings, workspaces,);
