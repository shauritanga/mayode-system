import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityFeedItem, type ActivityFeedItemData } from './ActivityFeedItem';

type ListProps = {
  items: ActivityFeedItemData[];
  onItemPress?: (item: ActivityFeedItemData) => void;
};

/** Grouped surface wrapping a short activity feed (home dashboard). */
export function ActivityFeedCard({ items, onItemPress }: ListProps) {
  return (
    <View style={styles.card}>
      {items.map((item, index) => (
        <ActivityFeedItem
          key={item.id}
          item={item}
          isLast={index === items.length - 1}
          onPress={onItemPress ? () => onItemPress(item) : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E8ECF0',
  },
});

export default ActivityFeedCard;
