// @generated automatically by Diesel CLI.

diesel::table! {
    projects (id) {
        id -> Integer,
        name -> Text,
        path -> Text,
        created_at -> Timestamp,
    }
}
